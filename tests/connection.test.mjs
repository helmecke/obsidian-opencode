import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
	stdin: { contents: `export * from './src/opencode/discovery';
		export * from './src/opencode/node-fetch';
		export * from './src/opencode/connection';
		export * from './src/settings';`, resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
const settingControls = [];
let processCalls = 0;
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => {
		if (name === 'obsidian') return {
			PluginSettingTab: class {},
			Setting: class {
				constructor() { settingControls.push(this); }
				setName(name) { this.name = name; return this; }
				setDesc(description) { this.description = description; return this; }
				addText(callback) {
					callback({ setPlaceholder() { return this; }, setValue() { return this; },
						onChange: (change) => { this.change = change; } });
					return this;
				}
				addToggle(callback) {
					const control = {
						value: undefined,
						setValue(value) { control.value = value; return control; },
						onChange(change) { control.change = change; },
					};
					callback(control);
					this.toggle = control;
					return this;
				}
			},
		};
		if (name === 'node:child_process' || name === 'child_process') {
			return new Proxy({}, { get: () => () => { processCalls++; throw new Error('Process launch is forbidden'); } });
		}
		return require(name);
	}, module, module.exports,
);
after(() => assert.equal(processCalls, 0, 'No connection path may launch or stop a process'));
const { discoverConnection, createNodeFetch, localOrigin, readRegistration, ConnectionCoordinator, loadSettings, OpenCodeSettingTab } = module.exports;

async function server(t, handler) {
	const instance = createServer(handler);
	await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
	t.after(() => { instance.closeAllConnections(); instance.close(); });
	return `http://127.0.0.1:${instance.address().port}`;
}

const secret = 'private-service-secret';
const registration = (url, extra = {}) => JSON.stringify({ url, pid: 42, version: '2.2.2', password: secret, ...extra });
const health = (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ pid: 42, version: '2.2.2' })); };

test('recovery rediscovery cannot be evicted by an obsolete discovery failure', async () => {
	let rejectOld;
	let finishNew;
	let calls = 0;
	const coordinator = new ConnectionCoordinator(() => ++calls === 1
		? new Promise((_resolve, reject) => { rejectOld = reject; })
		: new Promise((resolve) => { finishNew = resolve; }));
	const old = coordinator.connect();
	await Promise.resolve();
	coordinator.invalidate();
	const current = coordinator.connect();
	await Promise.resolve();
	rejectOld(new Error('obsolete credentials'));
	await assert.rejects(old);
	assert.equal(coordinator.connect(), current);
	const client = {};
	finishNew(client);
	assert.equal(await current, client);
	assert.equal(calls, 2);
	coordinator.dispose();
});

test('authenticated healthy service is reused and registration is rechecked', async (t) => {
	let requests = 0;
	const origin = await server(t, (req, res) => {
		requests++;
		assert.equal(req.headers.authorization, `Basic ${Buffer.from(`opencode:${secret}`).toString('base64')}`);
		health(req, res);
	});
	let reads = 0;
	const client = await discoverConnection(async () => { reads++; return registration(origin); });
	assert.equal(reads, 2);
	assert.equal((await client.server.info()).pid, 42);
	assert.equal(requests, 2);
});

test('true registration absence explains external startup; explicit retry reuses a newly available service', async (t) => {
	let reads = 0;
	let available;
	const coordinator = new ConnectionCoordinator(() => discoverConnection(async () => { reads++; return available; }));
	for (let i = 0; i < 2; i++) {
		await assert.rejects(coordinator.connect(), (error) => {
			assert.equal(error.code, 'absent');
			assert.match(error.message, /Enable Start OpenCode automatically/);
			assert.match(error.message, /start a compatible OpenCode 2 installation outside Obsidian/);
			return true;
		});
	}
	assert.equal(reads, 2);
	available = registration(await server(t, health));
	const client = await coordinator.connect();
	assert.equal((await client.server.info()).version, '2.2.2');
	assert.equal(reads, 4);
	assert.equal(await coordinator.connect(), client);
	assert.equal(reads, 4);
});

test('coordinator is lazy, deduplicates concurrent opens, caches success, and sanitizes failure', async () => {
	let calls = 0;
	let finish;
	const client = {};
	const coordinator = new ConnectionCoordinator(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
	assert.equal(calls, 0);
	const a = coordinator.connect();
	assert.equal(a, coordinator.connect());
	await Promise.resolve();
	finish(client);
	assert.equal(await a, client);
	assert.equal(await coordinator.connect(), client);
	assert.equal(calls, 1);
	const failed = new ConnectionCoordinator(async () => { throw new Error(secret); });
	await assert.rejects(failed.connect(), (error) => !error.stack.includes(secret));
});

test('unsafe registrations fail before any credential transmission', async () => {
	for (const url of ['https://127.0.0.1', 'http://localhost:4096', 'http://example.com', 'http://127.0.0.2',
		'http://2130706433', 'http://127.1', 'http://0177.0.0.1', 'http://0x7f000001',
		'http://user:pass@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1/?secret', 'http://127.0.0.1/#secret']) {
		assert.throws(() => localOrigin(url));
		await assert.rejects(discoverConnection(async () => registration(url)), { code: 'registration' });
	}
	for (const text of ['{', 'null', '{}', registration('http://127.0.0.1', { pid: -1 }),
		registration('http://127.0.0.1', { password: '' }), ' '.repeat(16_385)]) {
		await assert.rejects(discoverConnection(async () => text), { code: 'registration' });
	}
	assert.equal(localOrigin('http://[::1]:4096'), 'http://[::1]:4096');
});

test('incompatible and unreadable registrations never become absence; errors redact secrets', async () => {
	await assert.rejects(discoverConnection(async () => registration('http://127.0.0.1', { version: secret })),
		(error) => /Unsupported/.test(error.message) && !error.stack.includes(secret));
	await assert.rejects(discoverConnection(async () => { throw new Error(secret); }),
		(error) => error.code === 'registration' && !error.stack.includes(secret));
});

test('health failures, identity mismatch, and changed credentials reject reuse', async (t) => {
	const url = await server(t, health);
	for (const changed of [{ password: 'changed' }, { pid: 43 }, { version: '2.2.3' }, { id: 'new' }, { url: `${url}/` }]) {
		let reads = 0;
		await assert.rejects(discoverConnection(async () => registration(url, reads++ ? changed : {})), { code: 'identity' });
	}
	await assert.rejects(discoverConnection(async () => registration(url, { pid: 43 })), { code: 'identity' });
	let reads = 0;
	await assert.rejects(discoverConnection(async () => reads++ ? undefined : registration(url)), { code: 'identity' });
	for (const status of [401, 403, 500]) {
		const bad = await server(t, (_req, res) => { res.writeHead(status); res.end(secret); });
		await assert.rejects(discoverConnection(async () => registration(bad), undefined, () => true), (error) => {
			assert.ok(['authentication', 'transport'].includes(error.code));
			assert.ok(!error.stack.includes(secret));
			return true;
		});
	}
});

test('a registration whose process is gone is stale, while a reachable service is never launch permission', async (t) => {
	const instance = createServer(health);
	await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
	const url = `http://127.0.0.1:${instance.address().port}`;
	instance.close();
	await assert.rejects(discoverConnection(async () => registration(url), undefined, () => false), { code: 'stale' });
	await assert.rejects(discoverConnection(async () => registration(url), undefined, () => true), { code: 'transport' });
});

test('malformed health data fails closed without exposing response data', async (t) => {
	for (const body of ['null', '{}', JSON.stringify({ pid: 42, version: secret }), secret]) {
		const url = await server(t, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(body); });
		await assert.rejects(discoverConnection(async () => registration(url), undefined, () => true), (error) => {
			assert.ok(['identity', 'transport'].includes(error.code));
			assert.ok(!error.stack.includes(secret));
			return true;
		});
	}
});

test('origin binding, redirects, and oversized health responses fail closed', async (t) => {
	let hits = 0;
	const destination = await server(t, (_req, res) => { hits++; res.end('unexpected'); });
	const redirect = await server(t, (_req, res) => { res.writeHead(302, { location: destination }); res.end(); });
	await assert.rejects(createNodeFetch(redirect)(destination));
	await assert.rejects(discoverConnection(async () => registration(redirect), undefined, () => true), { code: 'transport' });
	assert.equal(hits, 0);
	const large = await server(t, (_req, res) => { res.end('x'.repeat(65_537)); });
	await assert.rejects(discoverConnection(async () => registration(large)), { code: 'transport' });
});

test('transport streams incrementally and handles abort and reader cancellation', async (t) => {
	const url = await server(t, (_req, res) => { res.writeHead(200); res.write('data: first\n\n'); });
	const response = await createNodeFetch(url)(url);
	const reader = response.body.getReader();
	assert.match(new TextDecoder().decode((await reader.read()).value), /first/);
	await reader.cancel();
	const abort = new AbortController();
	const other = await createNodeFetch(url)(url, { signal: abort.signal });
	const pending = other.body.getReader();
	await pending.read();
	abort.abort();
	await assert.rejects(pending.read());
	await assert.rejects(createNodeFetch(url)(url, { signal: abort.signal }));
});

test('bounded registration reads distinguish missing, malformed size, and non-files', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'opencode-discovery-'));
	try {
		assert.equal(await readRegistration(join(dir, 'missing')), undefined);
		await assert.rejects(readRegistration(dir), { code: 'registration' });
		const file = join(dir, 'registration.json');
		await writeFile(file, 'x'.repeat(16_385));
		await assert.rejects(readRegistration(file), { code: 'registration' });
		await writeFile(file, '{}');
		assert.equal(await readRegistration(file), '{}');
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test('settings retain executable paths with spaces as data and discard credentials', () => {
	const path = 'C:\\Program Files\\OpenCode\\opencode.exe';
	const defaults = { executablePath: '', autoStart: true, showReasoning: false, attachActiveNote: false };
	assert.deepEqual(loadSettings({ executablePath: path, password: secret, url: 'http://example.com' }),
		{ executablePath: path, autoStart: true, showReasoning: false, attachActiveNote: false });
	for (const executablePath of ['bad\npath', 'bad\rpath', 'bad\0path', 42, null, {}]) {
		assert.deepEqual(loadSettings({ executablePath }), defaults);
	}
	assert.deepEqual(loadSettings(undefined), defaults);
	assert.deepEqual(loadSettings({ executablePath: 'opencode.exe & other.exe' }),
		{ executablePath: 'opencode.exe & other.exe', autoStart: true, showReasoning: false, attachActiveNote: false });
	assert.deepEqual(loadSettings({ autoStart: false }), { ...defaults, autoStart: false });
	assert.deepEqual(loadSettings({ autoStart: true }), defaults);
	assert.deepEqual(loadSettings({ autoStart: 'no' }), defaults);
});

test('settings tab activates the OpenCode 2 path and automatic startup and saves valid data only', async () => {
	const settings = loadSettings(undefined);
	const saved = [];
	const tab = new OpenCodeSettingTab({}, {}, settings, async () => { saved.push({ ...settings }); });
	tab.containerEl = { empty() {} };
	tab.display();
	const pathControl = settingControls.find((control) => control.name === 'OpenCode 2 executable path');
	assert.ok(pathControl);
	assert.match(pathControl.description, /Full path to the OpenCode 2 executable/);
	assert.match(pathControl.description, /never run through a shell/);
	const path = 'C:\\Program Files\\OpenCode\\opencode.exe';
	await pathControl.change(path);
	for (const invalid of ['bad\0path', 'bad\rpath', 'bad\npath']) await pathControl.change(invalid);
	assert.deepEqual(settings, { executablePath: path, autoStart: true, showReasoning: false, attachActiveNote: false });
	assert.deepEqual(saved, [{ executablePath: path, autoStart: true, showReasoning: false, attachActiveNote: false }]);
	const autoStart = settingControls.find((control) => control.name === 'Start OpenCode automatically');
	assert.ok(autoStart);
	const toggle = autoStart.toggle;
	assert.match(autoStart.description, /plugin-owned OpenCode 2 process/);
	assert.equal(toggle.value, true);
	await toggle.change(false);
	assert.deepEqual(settings, { executablePath: path, autoStart: false, showReasoning: false, attachActiveNote: false });
	assert.deepEqual(saved.at(-1), { executablePath: path, autoStart: false, showReasoning: false, attachActiveNote: false });
	await pathControl.change('');
	assert.deepEqual(saved.at(-1), { executablePath: '', autoStart: false, showReasoning: false, attachActiveNote: false });
});

test('disposing before queued discovery prevents discovery and is idempotent', async () => {
	let calls = 0;
	const coordinator = new ConnectionCoordinator(async () => { calls++; return {}; });
	const pending = coordinator.connect();
	coordinator.dispose();
	coordinator.dispose();
	await assert.rejects(pending);
	await assert.rejects(coordinator.connect());
	assert.equal(calls, 0);
});

test('plugin disposal aborts a pending health request without stopping the mock shared service', async (t) => {
	let admitted;
	const started = new Promise((resolve) => { admitted = resolve; });
	let disconnected;
	const closed = new Promise((resolve) => { disconnected = resolve; });
	const paths = [];
	const url = await server(t, (req, res) => {
		paths.push(req.url);
		if (req.url === '/still-running') { res.end('running'); return; }
		res.on('close', disconnected);
		admitted();
	});
	const coordinator = new ConnectionCoordinator((signal) => discoverConnection(async () => registration(url), signal));
	const pending = coordinator.connect();
	await started;
	coordinator.dispose();
	await assert.rejects(pending);
	await closed;
	assert.equal(await (await createNodeFetch(url)(`${url}/still-running`)).text(), 'running');
	assert.deepEqual(paths, ['/api/info', '/still-running']);
});

test('plugin disposal cancels live streams and requests; other clients and execution are untouched', async (t) => {
	const paths = [];
	let execution = 'running';
	const url = await server(t, (req, res) => {
		paths.push(req.url);
		if (req.url === '/api/info') { health(req, res); return; }
		if (req.url === '/events') { res.writeHead(200); res.write('data: running\n\n'); return; }
		if (req.url === '/execution') { res.end(execution); return; }
		assert.fail(`Unexpected lifecycle mutation: ${req.url}`);
	});
	const coordinator = new ConnectionCoordinator((signal) => discoverConnection(async () => registration(url), signal));
	const client = await coordinator.connect();
	const ownedFetch = createNodeFetch(url, Infinity, coordinator.signal);
	const ownReader = (await ownedFetch(`${url}/events`)).body.getReader();
	const otherReader = (await createNodeFetch(url)(`${url}/events`)).body.getReader();
	await ownReader.read();
	await otherReader.read();
	coordinator.dispose();
	await assert.rejects(ownReader.read());
	await assert.rejects(client.server.info(), 'Even retained clients must not issue requests after unload');
	assert.equal(await (await createNodeFetch(url)(`${url}/execution`)).text(), 'running');
	execution = 'completed';
	assert.equal(await (await createNodeFetch(url)(`${url}/execution`)).text(), 'completed');
	assert.equal(paths.filter((path) => path === '/api/info').length, 1);
	await otherReader.cancel();
});
