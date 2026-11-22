import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
	stdin: { contents: `export * from './src/opencode/executable';
		export * from './src/opencode/version';
		export * from './src/opencode/port';
		export * from './src/opencode/managed-runtime';
		export * from './src/opencode/connection';
		export * from './src/opencode/errors';
		export * from './src/settings';`, resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? { PluginSettingTab: class {}, Setting: class {} } : require(name),
	module, module.exports,
);
const {
	resolveExecutable, parseOpenCodeVersion, validateExecutableVersion, selectLoopbackPort,
	ManagedRuntime, ConnectionCoordinator, ConnectionError, loadSettings,
} = module.exports;

const secret = 'managed-runtime-secret';

async function executable(t) {
	const dir = await mkdtemp(join(tmpdir(), 'opencode runtime '));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const file = join(dir, 'opencode.exe');
	await writeFile(file, '');
	return { dir, file };
}

async function infoServer(t, pid, version = '2.2.2') {
	const requests = [];
	const instance = createServer((req, res) => {
		requests.push({ url: req.url, authorization: req.headers.authorization });
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ pid, version }));
	});
	await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
	t.after(() => { instance.closeAllConnections(); instance.close(); });
	return { url: `http://127.0.0.1:${instance.address().port}`, port: instance.address().port, requests };
}

function fakeChild(pid) {
	const child = new EventEmitter();
	child.pid = pid;
	child.exitCode = null;
	child.signalCode = null;
	child.stdout = { resume() {} };
	child.stderr = { resume() {} };
	child.kill = () => { child.exitCode = 0; };
	return child;
}

async function waitFor(predicate, timeout = 2_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await sleep(5);
	}
	assert.fail('Condition was not reached in time');
}

test('executable resolution keeps paths as data, uses PATH, and rejects missing or shim executables', async (t) => {
	const { file } = await executable(t);
	assert.equal(await resolveExecutable({ configuredPath: file }), file);
	const files = new Set(['C:\\Tools A\\opencode.exe', 'C:\\Tools B\\opencode.exe']);
	const isFile = async (path) => files.has(path);
	assert.equal(await resolveExecutable({
		platform: 'win32', env: { Path: 'C:\\Tools A;C:\\Tools B' }, isFile,
	}), join('C:\\Tools A', 'opencode.exe'));
	const withSpaces = join('C:\\Program Files', 'OpenCode 2.2.2', 'opencode.exe');
	assert.equal(await resolveExecutable({ configuredPath: withSpaces, platform: 'win32', isFile: async (path) => path === withSpaces }),
		withSpaces);
	const npmBinary = join('C:\\Users\\Test\\AppData\\Roaming', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
	assert.equal(await resolveExecutable({
		platform: 'win32',
		env: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
		isFile: async (path) => path === npmBinary,
	}), npmBinary);
	await assert.rejects(resolveExecutable({ configuredPath: join('C:\\Missing', 'opencode.exe'), platform: 'win32', isFile }),
		{ code: 'executable' });
	await assert.rejects(resolveExecutable({ configuredPath: 'C:\\Tools\\opencode.cmd', platform: 'win32', isFile }),
		{ code: 'executable' });
});

test('version parsing accepts only opencode vX.Y.Z and validation rejects 1.x or malformed output', async () => {
	assert.equal(parseOpenCodeVersion('opencode v2.2.2\n'), '2.2.2');
	assert.equal(parseOpenCodeVersion('opencode v2.3.2+build.1'), '2.3.2+build.1');
	for (const output of ['opencode 2.2.2', 'v2.2.2', 'OpenCode v2.2.2', 'opencode v2.2', 'opencode v2.2.2\nsecond', '']) {
		assert.equal(parseOpenCodeVersion(output), undefined, output);
	}
	const query = (output) => async () => output;
	assert.equal(await validateExecutableVersion('stub', query('opencode v2.2.2')), '2.2.2');
	await assert.rejects(validateExecutableVersion('stub', query('opencode v1.9.9')), { code: 'version' });
	await assert.rejects(validateExecutableVersion('stub', query('opencode v3.0.0')), { code: 'version' });
	await assert.rejects(validateExecutableVersion('stub', query('not a version')), { code: 'version' });
	await assert.rejects(validateExecutableVersion('stub', async () => { throw new Error(secret); }), (error) => {
		assert.equal(error.code, 'version');
		assert.ok(!error.message.includes(secret));
		return true;
	});
});

test('ephemeral port selection binds literal loopback, releases the port, and retries EADDRINUSE once', async (t) => {
	const calls = [];
	const fakeCreate = () => {
		let onerror;
		return {
			once(event, handler) { if (event === 'error') onerror = handler; return this; },
			listen(port, host, callback) {
				calls.push([port, host]);
				if (calls.length === 1) queueMicrotask(() => onerror({ code: 'EADDRINUSE' }));
				else callback();
				return this;
			},
			address() { return { port: 45_678, address: '127.0.0.1', family: 'IPv4' }; },
			close(callback) { callback?.(); },
		};
	};
	assert.equal(await selectLoopbackPort(fakeCreate), 45_678);
	assert.deepEqual(calls, [[0, '127.0.0.1'], [0, '127.0.0.1']]);
	const port = await selectLoopbackPort();
	const probe = createServer();
	await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
	t.after(() => probe.close());
	assert.ok(port > 0);
});

function runtimeOptions(t, executablePath, stateDir, server, overrides = {}) {
	const spawns = [];
	const orphans = [];
	const kills = [];
	let child = fakeChild(4_321);
	const options = {
		executablePath: () => executablePath,
		enabled: () => true,
		stateDir: () => stateDir,
		readOrphan: () => overrides.orphan,
		writeOrphan: (record) => { orphans.push(record); },
		spawn: (command, args, spawnOptions) => {
			spawns.push({ command, args, options: spawnOptions });
			if (overrides.spawn) return overrides.spawn(command, args, spawnOptions, spawns);
			return child;
		},
		killTree: async (pid) => { kills.push(pid); },
		findPort: async () => server.port,
		versionQuery: async () => 'opencode v2.2.2',
		readyTimeout: 2_000,
		pollInterval: 10,
		randomPassword: () => secret,
		randomToken: () => 'start-token',
		isAlive: () => false,
		...overrides.runtime,
	};
	return { options, spawns, orphans, kills, child: () => child, setChild: (value) => { child = value; } };
}

test('managed runtime spawns a private loopback service without a shell and owns its lifecycle', async (t) => {
	const { dir, file } = await executable(t);
	const stateDir = join(dir, 'state');
	const server = await infoServer(t, 4_321);
	const registration = join(dir, 'service.json');
	const shared = JSON.stringify({ pid: 99, url: 'http://127.0.0.1:9999', password: 'shared' });
	await writeFile(registration, shared);
	const fixture = runtimeOptions(t, file, stateDir, server);
	const runtime = new ManagedRuntime(fixture.options);
	const statuses = [];
	runtime.subscribe(() => statuses.push(runtime.status.phase));
	const client = await runtime.acquire();
	assert.equal((await client.server.info()).pid, 4_321);
	assert.deepEqual(fixture.spawns.map(({ command, args }) => ({ command, args })), [{
		command: file,
		args: ['serve', '--hostname', '127.0.0.1', '--port', String(server.port)],
	}]);
	const spawnOptions = fixture.spawns[0].options;
	assert.equal(spawnOptions.shell, false);
	assert.equal(spawnOptions.windowsHide, true);
	assert.equal(spawnOptions.detached, process.platform !== 'win32');
	assert.deepEqual(spawnOptions.stdio, ['ignore', 'pipe', 'pipe']);
	assert.equal(spawnOptions.env.OPENCODE_SERVER_PASSWORD, secret);
	assert.equal(spawnOptions.env.XDG_STATE_HOME, stateDir);
	assert.deepEqual(fixture.orphans[0], { pid: 4_321, token: 'start-token' });
	assert.equal(server.requests[0].authorization, `Basic ${Buffer.from(`opencode:${secret}`).toString('base64')}`);
	assert.equal(await readFile(registration, 'utf8'), shared, 'The shared registration is untouched');
	await runtime.dispose();
	assert.deepEqual(fixture.kills, [4_321]);
	assert.equal(fixture.orphans.at(-1), undefined);
	assert.deepEqual(statuses, ['starting', 'running', 'idle']);
});

test('readiness requires the spawned PID and a bounded timeout', async (t) => {
	const { dir, file } = await executable(t);
	const server = await infoServer(t, 9_999);
	const fixture = runtimeOptions(t, file, dir, server, { runtime: { readyTimeout: 60, pollInterval: 5 } });
	const runtime = new ManagedRuntime(fixture.options);
	await assert.rejects(runtime.acquire(), { code: 'timeout' });
	assert.equal(runtime.status.phase, 'failed');
	await runtime.dispose();
});

test('a previous orphan is killed before a new start and a crash restarts with backoff', async (t) => {
	const { dir, file } = await executable(t);
	const server = await infoServer(t, 4_321);
	const kills = [];
	let spawned = 0;
	const children = [];
	const fixture = runtimeOptions(t, file, dir, server, {
		orphan: { pid: 7_777, token: 'old-token' },
		runtime: {
			isAlive: (pid) => pid === 7_777,
			killTree: async (pid) => { kills.push(pid); },
			restartAttempts: 2,
			restartBaseDelay: 10,
		},
		spawn: (_command, _args, _options, spawns) => {
			spawned++;
			const child = fakeChild(4_321);
			children.push(child);
			spawns.push({});
			return child;
		},
	});
	const runtime = new ManagedRuntime(fixture.options);
	const phases = [];
	runtime.subscribe(() => phases.push(runtime.status.phase));
	await runtime.acquire();
	assert.deepEqual(kills, [7_777], 'The recorded orphan is reaped before spawn');
	assert.equal(spawned, 1);
	children[0].emit('exit', 1, null);
	await waitFor(() => runtime.status.phase === 'running' && spawned === 2);
	assert.deepEqual(phases.slice(-3), ['restarting', 'starting', 'running']);
	await runtime.dispose();
	assert.ok(kills.includes(4_321));
});

test('restart attempts are bounded and end in an actionable failure', async (t) => {
	const { dir, file } = await executable(t);
	const server = await infoServer(t, 4_321);
	let spawned = 0;
	let firstChild;
	const fixtures = runtimeOptions(t, file, dir, server, {
		runtime: { restartAttempts: 2, restartBaseDelay: 5 },
		spawn: (_command, _args, _options, spawns) => {
			spawned++;
			spawns.push({});
			if (spawned > 1) throw new Error('private spawn detail');
			firstChild = fakeChild(4_321);
			return firstChild;
		},
	});
	const runtime = new ManagedRuntime(fixtures.options);
	await runtime.acquire();
	firstChild.emit('exit', 1, null);
	await waitFor(() => runtime.status.phase === 'failed', 3_000);
	assert.match(runtime.status.error, /could not be started/i);
	assert.ok(!runtime.status.error.includes(secret));
	assert.equal(spawned, 3, 'Initial start plus two bounded restarts');
	await runtime.dispose();
});

test('connection coordinator falls back only for absence or a dead registration', async () => {
	const makeRuntime = () => {
		let disposed = 0;
		let acquired = 0;
		const listeners = new Set();
		return {
			enabled: true,
			status: { phase: 'idle' },
			acquire: async () => { acquired++; return { managed: true }; },
			dispose: () => { disposed++; },
			subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
			get acquired() { return acquired; },
			get disposed() { return disposed; },
		};
	};
	for (const code of ['absent', 'stale']) {
		const runtime = makeRuntime();
		const coordinator = new ConnectionCoordinator(async () => { throw new ConnectionError(code); }, runtime);
		assert.deepEqual(await coordinator.connect(), { managed: true });
		assert.equal(runtime.acquired, 1);
		assert.deepEqual(coordinator.status, { mode: 'managed', phase: 'running' });
		coordinator.dispose();
		assert.equal(runtime.disposed, 1);
	}
	for (const code of ['registration', 'authentication', 'identity', 'transport']) {
		const runtime = makeRuntime();
		const coordinator = new ConnectionCoordinator(async () => { throw new ConnectionError(code); }, runtime);
		await assert.rejects(coordinator.connect(), { code });
		assert.equal(runtime.acquired, 0);
		coordinator.dispose();
	}
	const disabled = makeRuntime();
	disabled.enabled = false;
	const coordinator = new ConnectionCoordinator(async () => { throw new ConnectionError('absent'); }, disabled);
	await assert.rejects(coordinator.connect(), { code: 'absent' });
	assert.equal(disabled.acquired, 0);
	const shared = makeRuntime();
	const sharedCoordinator = new ConnectionCoordinator(async () => ({ shared: true }), shared);
	assert.deepEqual(await sharedCoordinator.connect(), { shared: true });
	assert.equal(shared.acquired, 0);
	assert.deepEqual(sharedCoordinator.status, { mode: 'shared', phase: 'running' });
	sharedCoordinator.dispose();
});

test('managed errors are fixed, password-free, and settings preserve the orphan record', () => {
	for (const code of ['executable', 'version', 'startup', 'timeout', 'stale', 'absent']) {
		const error = new ConnectionError(code);
		assert.equal(error.code, code);
		assert.ok(!error.message.includes(secret));
		assert.ok(!/password/i.test(error.message));
	}
	assert.deepEqual(loadSettings({ autoStart: false, managedOrphan: { pid: 42, token: 'abc' } }), {
		executablePath: '', autoStart: false, managedOrphan: { pid: 42, token: 'abc' },
	});
	assert.deepEqual(loadSettings({ managedOrphan: { pid: -1, token: 'abc' } }), { executablePath: '', autoStart: true });
});
