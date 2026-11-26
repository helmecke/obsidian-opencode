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
const { SessionCoordinator, SessionError, loadSettings, sameDirectory } = module.exports;
const root = 'C:\\Notes vault';
const info = (id, directory = root) => ({ id, location: { directory }, projectID: 'project', time: { created: 1, updated: 1 } });
const message = (id, text) => ({ id, type: 'user', time: { created: 1 }, text });
const page = (data, next) => ({ data, cursor: { next } });

function fixture() {
	const controller = new AbortController();
	const calls = [];
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
				const session = { ...info('new', input.location.directory),
					...(input.title ? { title: input.title } : {}) };
				records.set(session.id, session);
				return session;
			},
			update: async (input, options) => {
				calls.push(['update', input, options]);
				const session = records.get(input.sessionID);
				if (session) records.set(input.sessionID, { ...session, title: input.title });
			},
		},
		message: { list: async ({ sessionID, ...input }, options) => {
			calls.push(['messages', sessionID, input, options]); return page(texts.get(sessionID) ?? []);
		} },
	};
	const connection = { signal: controller.signal, connect: async () => client };
	const coordinator = new SessionCoordinator(connection, () => root);
	return { coordinator, connection, client, calls, records, texts, controller };
}

test('opening is lazy, filters multiple projects by exact directory, and never auto-creates or auto-selects', async () => {
	const f = fixture();
	assert.deepEqual(f.calls, []);
	f.records.set('child', info('child', root + '\\nested'));
	f.records.set('sibling', info('sibling', root + '-other'));
	const [a, b] = await Promise.all([f.coordinator.open(), f.coordinator.open()]);
	assert.equal(a, b);
	assert.deepEqual(a.sessions.map((s) => s.id), ['one', 'two']);
	assert.equal(a.empty, 'none');
	assert.equal(a.selected, undefined);
	assert.deepEqual(a.messages, []);
	assert.deepEqual(f.calls.map((c) => c[0]), ['list']);
	assert.equal(f.calls[0][1].directory, root);
	assert.equal(f.calls[0][2].signal, f.controller.signal);
});

test('delegated subagent sessions stay out of the conversation list at any depth', async () => {
	const f = fixture();
	f.records.set('delegated', { ...info('delegated'), parentID: 'one' });
	f.records.set('nested', { ...info('nested'), parentID: 'delegated' });
	const snapshot = await f.coordinator.open();
	assert.deepEqual(snapshot.sessions.map((s) => s.id), ['one', 'two']);
	assert.deepEqual((await f.coordinator.list()).map((s) => s.id), ['one', 'two']);
});

test('selection loads authoritative messages and reopening reloads the in-memory selection without creation', async () => {
	const f = fixture();
	await f.coordinator.open();
	assert.equal((await f.coordinator.select('one')).messages[0].text, 'first');
	assert.equal(f.coordinator.selectedID, 'one');
	f.texts.set('one', [message('m1', 'changed'), message('m3', 'server-added')]);
	assert.deepEqual((await f.coordinator.open()).messages.map((m) => m.text), ['changed', 'server-added']);
	assert.equal(f.coordinator.state.selected.id, 'one', 'Opening reloads the in-memory selection');
	assert.equal(f.calls.filter((c) => c[0] === 'create').length, 0, 'Opening never creates a session');
});

test('missing, foreign, and cross-vault selections yield a recoverable empty state without fallback', async () => {
	for (const id of ['missing', 'other']) {
		const f = fixture();
		const state = await f.coordinator.select(id);
		assert.equal(state.empty, 'unavailable');
		assert.equal(state.selected, undefined);
		assert.deepEqual(state.messages, []);
		assert.equal(f.calls.some((c) => c[0] === 'messages' || c[0] === 'create'), false);
		assert.equal((await f.coordinator.select('two')).selected.id, 'two');
	}
	const f = fixture();
	f.records.set('one', info('one', 'C:\\Other vault'));
	assert.equal((await f.coordinator.select('one')).empty, 'unavailable');
	assert.equal(f.coordinator.selectedID, undefined);
});

test('explicit selection rejects foreign sessions before requesting their messages', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	const state = await f.coordinator.select('other');
	assert.equal(state.empty, 'unavailable');
	assert.deepEqual(state.messages, []);
	assert.equal(f.calls.filter((c) => c[0] === 'messages' && c[1] === 'other').length, 0);
});

test('openChild selects a resolved child and keeps it out of the conversation list', async () => {
	const f = fixture();
	f.records.set('child', { ...info('child'), parentID: 'one' });
	f.texts.set('child', [message('c1', 'delegated work')]);
	await f.coordinator.open();
	await f.coordinator.select('one');
	const state = await f.coordinator.openChild('child');
	assert.equal(state.selected.id, 'child');
	assert.equal(f.coordinator.selectedID, 'child');
	assert.deepEqual(state.messages.map((m) => m.text), ['delegated work']);
	assert.deepEqual(state.sessions.map((s) => s.id), ['one', 'two'],
		'The child is selected but never listed as a conversation');
});

test('openChild rejects a missing or foreign child and leaves the previous snapshot unchanged', async () => {
	for (const id of ['missing', 'other']) {
		const f = fixture();
		await f.coordinator.select('one');
		await assert.rejects(f.coordinator.openChild(id), (error) =>
			error instanceof SessionError && error.message === 'Unable to open the subagent session. It may no longer exist.');
		assert.equal(f.coordinator.state.selected.id, 'one', `${id} leaves the parent selected`);
		assert.deepEqual(f.coordinator.state.messages.map((m) => m.text), ['first'],
			`${id} leaves the parent transcript in place`);
		assert.equal(f.calls.filter((c) => c[0] === 'messages' && c[1] === id).length, 0,
			`${id} is rejected before its messages are requested`);
	}
});

test('openChild keeps the abort and error-wrapping behavior of a selection load', async () => {
	const f = fixture();
	f.records.set('child', { ...info('child'), parentID: 'one' });
	await f.coordinator.select('one');
	let finish;
	f.client.message.list = async (_input, { signal }) => {
		assert.equal(signal, f.controller.signal);
		return new Promise((resolve) => { finish = resolve; });
	};
	const pending = f.coordinator.openChild('child');
	await new Promise(setImmediate);
	f.controller.abort();
	finish(page([message('late', 'hidden')]));
	await assert.rejects(pending);
	assert.equal(f.coordinator.state.selected.id, 'one');
	assert.deepEqual(f.coordinator.state.messages.map((m) => m.text), ['first']);

	const g = fixture();
	g.records.set('child', { ...info('child'), parentID: 'one' });
	g.client.session.get = async ({ sessionID }) => {
		if (sessionID === 'one') return g.records.get('one');
		throw new Error('private upstream detail');
	};
	await g.coordinator.select('one');
	await assert.rejects(g.coordinator.openChild('child'), (error) =>
		error instanceof SessionError && !error.message.includes('private'));
	assert.equal(g.coordinator.state.selected.id, 'one');
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

test('beginDraft clears the selection, keeps a local title, and applies it when the first create happens', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.select('one');
	const draft = await f.coordinator.beginDraft();
	assert.equal(draft.selected, undefined);
	assert.equal(draft.empty, 'none');
	assert.equal(f.coordinator.selectedID, undefined);

	await f.coordinator.setDraftTitle('  Planned conversation  ');
	await f.coordinator.setDraftAgent('plan');
	await f.coordinator.setDraftModel({ providerID: 'p', id: 'm2', variant: 'high' });
	assert.equal(f.coordinator.state.draftTitle, 'Planned conversation');
	const reopened = await f.coordinator.open();
	assert.equal(reopened.selected, undefined, 'Reconnecting keeps the draft selection');
	assert.equal(reopened.draftTitle, 'Planned conversation', 'Reconnecting keeps the draft title');
	assert.equal(reopened.draftAgent, 'plan', 'Reconnecting keeps the draft agent');
	assert.deepEqual(reopened.draftModel, { providerID: 'p', id: 'm2', variant: 'high' });

	const state = await f.coordinator.create();
	assert.deepEqual(f.calls.find((call) => call[0] === 'create')[1],
		{ location: { directory: root }, title: 'Planned conversation', agent: 'plan',
			model: { id: 'm2', providerID: 'p', variant: 'high' } });
	assert.equal(state.selected.title, 'Planned conversation');
	assert.equal(state.draftTitle, undefined, 'The admitted session replaces the draft');
});

test('a failed message load after creation retains the admitted selection for a safe reopen', async () => {
	const f = fixture();
	const original = f.client.message.list;
	f.client.message.list = async () => { throw new Error('private transcript and password'); };
	await assert.rejects(f.coordinator.create(), (error) => !error.stack.includes('private'));
	assert.equal(f.coordinator.state.selected.id, 'new');
	f.client.message.list = original;
	assert.equal((await f.coordinator.open()).selected.id, 'new');
	assert.equal(f.calls.filter((c) => c[0] === 'create').length, 1);
});

test('rename rejects blank titles locally and sends nothing', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	await assert.rejects(f.coordinator.rename('   '), /Enter a conversation name/);
	assert.equal(f.calls.filter((c) => c[0] === 'update').length, 0);
	assert.equal(f.coordinator.state.selected.title, undefined);
});

test('rename writes the trimmed title, then re-reads the server-confirmed session', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.select('one');
	const state = await f.coordinator.rename('  Renamed conversation  ');
	assert.deepEqual(f.calls.find((c) => c[0] === 'update')[1], { sessionID: 'one', title: 'Renamed conversation' });
	assert.equal(state.selected.title, 'Renamed conversation');
	assert.equal(f.calls.filter((c) => c[0] === 'update').length, 1);
	assert.equal(f.calls.filter((c) => c[0] === 'messages').length, 1, 'Rename does not reload the transcript');
	const listed = f.coordinator.state.sessions.find((session) => session.id === 'one');
	assert.equal(listed.title, 'Renamed conversation');
});

test('rename failure surfaces a fixed error and keeps the previous title', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	f.records.set('one', { ...f.records.get('one'), title: 'Previous' });
	await f.coordinator.refreshSelected();
	f.client.session.update = async () => { throw new Error('private upstream detail'); };
	await assert.rejects(f.coordinator.rename('Next'), (error) =>
		error.message === 'Unable to rename the conversation. Try again.'
		&& !error.message.includes('private'));
	assert.equal(f.coordinator.state.selected.title, 'Previous');
});

test('list and message pagination load every authoritative page in server order', async () => {
	const f = fixture();
	await f.coordinator.select('one');
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
	const f = fixture();
	await f.coordinator.select('one');
	f.client.message.list = async () => { f.records.set('one', info('one', '/elsewhere')); return page([message('private', 'hidden')]); };
	assert.equal((await f.coordinator.open()).empty, 'unavailable');
	assert.deepEqual(f.coordinator.state.messages, []);
});

test('transport failure is not treated as missing selection and can be retried', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	const original = f.client.session.get;
	f.client.session.get = async () => { throw new Error('private credentials'); };
	await assert.rejects(f.coordinator.open(), { message: 'Unable to load conversations. Retry or choose a conversation again.' });
	assert.equal(f.coordinator.state.selected.id, 'one');
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
});

test('cyclic pagination fails closed instead of looping or publishing partial messages', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	f.client.message.list = async () => page([message('m1', 'partial')], 'cycle');
	await assert.rejects(f.coordinator.open());
	assert.deepEqual(f.coordinator.state.messages, []);
	f.client.session.list = async () => page([info('one')], 'cycle');
	await assert.rejects(f.coordinator.list());
});

test('endless unique pagination is bounded instead of exhausting memory', async () => {
	const f = fixture();
	await f.coordinator.select('one');
	let pages = 0;
	f.client.message.list = async () => {
		pages++;
		return page([message(`m${pages}`, 'x')], `page-${pages}`);
	};
	await assert.rejects(f.coordinator.open());
	assert.deepEqual(f.coordinator.state.messages, []);
	let sessionPages = 0;
	f.client.session.list = async () => {
		sessionPages++;
		return page([info(`s${sessionPages}`)], `spage-${sessionPages}`);
	};
	await assert.rejects(f.coordinator.list());
});

test('unload aborts requests, suppresses late snapshots and forbids subsequent operations', async () => {
	const f = fixture();
	await f.coordinator.select('one');
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
	const invalid = new SessionCoordinator(f.connection, () => 'display name');
	await assert.rejects(invalid.create());
	assert.deepEqual(f.calls, []);
});

test('settings parsing strips credentials, transcripts, and legacy selection data', () => {
	assert.deepEqual(loadSettings({ executablePath: 'opencode', password: 'secret', messages: ['private'],
		selectedSession: { id: 'one', directory: root, transcript: ['secret'], authorization: 'secret' } }),
	{ executablePath: 'opencode', autoStart: true, showReasoning: false, attachActiveNote: false });
});

test('pinned generated client uses actual session/message routes and envelopes with isolated fetch', async () => {
	const requests = [];
	const client = OpenCode.make({ baseUrl: 'http://127.0.0.1:4096', fetch: async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		requests.push([request.method, url, request.method === 'POST' || request.method === 'PATCH'
			? await request.json() : undefined]);
		const data = url.pathname.endsWith('/message') ? page([message('m1', 'snapshot')])
			: url.pathname === '/api/session' && request.method === 'GET' ? page([info('one')]) : { data: info('one') };
		return Response.json(data);
	} });
	const f = fixture();
	const coordinator = new SessionCoordinator({ signal: f.controller.signal, connect: async () => client }, () => root);
	assert.equal((await coordinator.create()).messages[0].text, 'snapshot');
	assert.equal((await coordinator.list())[0].id, 'one');
	assert.deepEqual(requests[0][2], { location: { directory: root } });
	assert.ok(requests.some(([, url]) => url.pathname === '/api/session/one/message' && url.searchParams.get('order') === 'asc'));
	assert.ok(requests.some(([method, url]) => method === 'GET' && url.pathname === '/api/session' && url.searchParams.get('directory') === root));
});
