import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { OpenCode } from '@opencode/client';

const bundle = await build({
	stdin: { contents: `export * from './src/opencode/sessions'; export * from './src/opencode/vault-directory';
		export * from './src/settings';`, resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? { PluginSettingTab: class {} } : require(name), module, module.exports,
);
const { SessionCoordinator, loadSettings, sameDirectory } = module.exports;
const root = 'C:\\Notes vault';
const info = (id, directory = root) => ({ id, location: { directory }, projectID: 'project', time: { created: 1, updated: 1 } });
const message = (id, text) => ({ id, type: 'user', time: { created: 1 }, text });
const page = (data, next) => ({ data, cursor: { next } });

function fixture(saved) {
	const controller = new AbortController();
	const calls = [];
	const settings = loadSettings({ executablePath: 'C:\\Program Files\\OpenCode\\opencode.exe', selectedSession: saved });
	const writes = [];
	const records = new Map([['one', info('one')], ['two', info('two')], ['other', info('other', 'C:\\Other vault')]]);
	const texts = new Map([['one', [message('m1', 'first')]], ['two', [message('m2', 'second')]]]);
	const client = {
		session: {
			list: async (input, options) => { calls.push(['list', input, options]); return page([...records.values()]); },
			get: async ({ sessionID }, options) => {
				calls.push(['get', sessionID, options]);
				if (!records.has(sessionID)) throw { _tag: 'SessionNotFoundError', sessionID };
				return records.get(sessionID);
			},
			create: async (input, options) => {
				calls.push(['create', input, options]);
				const session = info('new', input.location.directory);
				records.set(session.id, session);
				return session;
			},
		},
		message: { list: async ({ sessionID, ...input }, options) => {
			calls.push(['messages', sessionID, input, options]); return page(texts.get(sessionID) ?? []);
		} },
	};
	const connection = { signal: controller.signal, connect: async () => client };
	const save = async () => { writes.push(structuredClone(settings)); };
	const coordinator = new SessionCoordinator(connection, () => root, settings, save);
	return { coordinator, connection, client, settings, writes, calls, records, texts, controller, save };
}

test('opening is lazy, filters multiple projects by exact directory, and never auto-creates', async () => {
	const f = fixture();
	assert.deepEqual(f.calls, []);
	f.records.set('child', info('child', root + '\\nested'));
	f.records.set('sibling', info('sibling', root + '-other'));
	const [a, b] = await Promise.all([f.coordinator.open(), f.coordinator.open()]);
	assert.equal(a, b);
	assert.deepEqual(a.sessions.map((s) => s.id), ['one', 'two']);
	assert.equal(a.empty, 'none');
	assert.deepEqual(a.messages, []);
	assert.deepEqual(f.calls.map((c) => c[0]), ['list']);
	assert.equal(f.calls[0][1].directory, root);
	assert.equal(f.calls[0][2].signal, f.controller.signal);
});

test('selection persists only allowlisted metadata and reopen fetches authoritative messages without creation', async () => {
	const f = fixture();
	await f.coordinator.open();
	assert.equal((await f.coordinator.select('one')).messages[0].text, 'first');
	assert.deepEqual(f.writes.at(-1), { executablePath: f.settings.executablePath, autoStart: true, selectedSession: { id: 'one', directory: root } });
	f.texts.set('one', [message('m1', 'changed'), message('m3', 'server-added')]);
	assert.deepEqual((await f.coordinator.open()).messages.map((m) => m.text), ['changed', 'server-added']);
	const reloaded = new SessionCoordinator(f.connection, () => root, loadSettings(f.writes.at(-1)), f.save);
	assert.equal((await reloaded.open()).selected.id, 'one');
	assert.equal(f.calls.filter((c) => c[0] === 'create').length, 0);
});

test('missing, moved, and copied cross-vault saved selections yield recoverable empty state without fallback', async () => {
	for (const saved of [{ id: 'missing', directory: root }, { id: 'other', directory: root }, { id: 'one', directory: 'C:\\Other vault' }]) {
		const f = fixture(saved);
		const state = await f.coordinator.open();
		assert.equal(state.empty, 'unavailable');
		assert.equal(state.selected, undefined);
		assert.deepEqual(state.messages, []);
		assert.equal(f.settings.selectedSession, undefined);
		assert.equal(f.calls.some((c) => c[0] === 'messages' || c[0] === 'create'), false);
		assert.equal((await f.coordinator.select('two')).selected.id, 'two');
	}
});

test('explicit selection rejects foreign sessions before requesting their messages', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	const state = await f.coordinator.select('other');
	assert.equal(state.empty, 'unavailable');
	assert.deepEqual(state.messages, []);
	assert.equal(f.calls.filter((c) => c[0] === 'messages' && c[1] === 'other').length, 0);
});

test('concurrent creation is deduplicated, uses the absolute vault path, and reopen does not create again', async () => {
	const f = fixture();
	const a = f.coordinator.create();
	assert.equal(a, f.coordinator.create());
	assert.equal((await a).selected.id, 'new');
	assert.equal((await f.coordinator.open()).selected.id, 'new');
	const calls = f.calls.filter((c) => c[0] === 'create');
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0][1], { location: { directory: root } });
	assert.equal(calls[0][2].signal, f.controller.signal);
});

test('a failed message load after creation retains the admitted selection for a safe reopen', async () => {
	const f = fixture();
	const original = f.client.message.list;
	f.client.message.list = async () => { throw new Error('private transcript and password'); };
	await assert.rejects(f.coordinator.create(), (error) => !error.stack.includes('private'));
	assert.equal(f.settings.selectedSession.id, 'new');
	f.client.message.list = original;
	assert.equal((await f.coordinator.open()).selected.id, 'new');
	assert.equal(f.calls.filter((c) => c[0] === 'create').length, 1);
});

test('list and message pagination load every authoritative page in server order', async () => {
	const f = fixture({ id: 'one', directory: root });
	f.client.session.list = async ({ directory, cursor }) => {
		assert.equal(directory, root);
		return cursor ? page([info('two'), info('other', '/elsewhere')]) : page([info('one')], 'sessions-2');
	};
	f.client.message.list = async ({ sessionID, order, cursor }) => {
		assert.equal(sessionID, 'one'); assert.equal(order, cursor ? undefined : 'asc');
		return cursor ? page([message('m2', 'last')]) : page([message('m1', 'first')], 'messages-2');
	};
	const state = await f.coordinator.open();
	assert.deepEqual(state.sessions.map((s) => s.id), ['one', 'two']);
	assert.deepEqual(state.messages.map((m) => m.id), ['m1', 'm2']);
});

test('a moved session during loading cannot publish a foreign transcript', async () => {
	const f = fixture({ id: 'one', directory: root });
	f.client.message.list = async () => { f.records.set('one', info('one', '/elsewhere')); return page([message('private', 'hidden')]); };
	assert.equal((await f.coordinator.open()).empty, 'unavailable');
	assert.deepEqual(f.coordinator.state.messages, []);
});

test('transport failure is not treated as missing selection and can be retried', async () => {
	const f = fixture({ id: 'one', directory: root });
	const original = f.client.session.get;
	f.client.session.get = async () => { throw new Error('private credentials'); };
	await assert.rejects(f.coordinator.open(), { message: 'Unable to load conversations. Retry or choose a conversation again.' });
	assert.equal(f.settings.selectedSession.id, 'one');
	f.client.session.get = original;
	assert.equal((await f.coordinator.open()).selected.id, 'one');
});

test('queued selection changes cannot publish stale results over the final selection', async () => {
	const f = fixture();
	const first = f.coordinator.select('one');
	const second = f.coordinator.select('two');
	await Promise.all([first, second]);
	assert.equal(f.coordinator.state.selected.id, 'two');
	assert.equal(f.coordinator.state.messages[0].text, 'second');
	assert.equal(f.settings.selectedSession.id, 'two');
});

test('cyclic pagination fails closed instead of looping or publishing partial messages', async () => {
	const f = fixture({ id: 'one', directory: root });
	f.client.message.list = async () => page([message('m1', 'partial')], 'cycle');
	await assert.rejects(f.coordinator.open());
	assert.deepEqual(f.coordinator.state.messages, []);
	f.client.session.list = async () => page([info('one')], 'cycle');
	await assert.rejects(f.coordinator.list());
});

test('unload aborts requests, suppresses late snapshots/persistence and forbids subsequent operations', async () => {
	const f = fixture({ id: 'one', directory: root });
	let finish;
	f.client.message.list = async (_input, { signal }) => {
		assert.equal(signal, f.controller.signal);
		return new Promise((resolve) => { finish = resolve; });
	};
	const pending = f.coordinator.open();
	await new Promise(setImmediate);
	f.controller.abort();
	finish(page([message('late', 'hidden')]));
	await assert.rejects(pending);
	assert.deepEqual(f.coordinator.state.messages, []);
	assert.deepEqual(f.writes, []);
	await assert.rejects(f.coordinator.create());
	await assert.rejects(f.coordinator.list());
});

test('absolute path comparison handles Windows aliases but not nested or unrelated vaults', async () => {
	assert.equal(sameDirectory('C:\\Vault\\', 'c:/vault'), true);
	assert.equal(sameDirectory('/vault/', '/vault'), true);
	assert.equal(sameDirectory('/Vault', '/vault'), false);
	assert.equal(sameDirectory('Vault', 'Vault'), false);
	assert.equal(sameDirectory('C:\\Vault', 'C:\\Vault\\child'), false);
	const f = fixture();
	const invalid = new SessionCoordinator(f.connection, () => 'display name', f.settings, f.save);
	await assert.rejects(invalid.create());
	assert.deepEqual(f.calls, []);
});

test('settings parsing strips credentials, transcripts, and unrecognized selection data', () => {
	assert.deepEqual(loadSettings({ executablePath: 'opencode', password: 'secret', messages: ['private'],
		selectedSession: { id: 'one', directory: root, transcript: ['secret'], authorization: 'secret' } }),
	{ executablePath: 'opencode', autoStart: true, selectedSession: { id: 'one', directory: root } });
});

test('pinned generated client uses actual session/message routes and envelopes with isolated fetch', async () => {
	const requests = [];
	const client = OpenCode.make({ baseUrl: 'http://127.0.0.1:4096', fetch: async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		requests.push([request.method, url, request.method === 'POST' ? await request.json() : undefined]);
		const data = url.pathname.endsWith('/message') ? page([message('m1', 'snapshot')])
			: url.pathname === '/api/session' && request.method === 'GET' ? page([info('one')]) : { data: info('one') };
		return Response.json(data);
	} });
	const f = fixture();
	const coordinator = new SessionCoordinator({ signal: f.controller.signal, connect: async () => client }, () => root, f.settings, f.save);
	assert.equal((await coordinator.create()).messages[0].text, 'snapshot');
	assert.equal((await coordinator.list())[0].id, 'one');
	assert.deepEqual(requests[0][2], { location: { directory: root } });
	assert.ok(requests.some(([, url]) => url.pathname === '/api/session/one/message' && url.searchParams.get('order') === 'asc'));
	assert.ok(requests.some(([method, url]) => method === 'GET' && url.pathname === '/api/session' && url.searchParams.get('directory') === root));
});
