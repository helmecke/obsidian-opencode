import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

// Exercise the real TypeScript modules without generated test files or a new runner.
const bundle = await build({
	stdin: {
		contents: `export * from './src/opencode/compatibility';
			export * from './src/opencode/service-policy';`,
		resolveDir: process.cwd(), loader: 'ts',
	},
	bundle: true, format: 'cjs', target: 'es2021', write: false,
});
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	createRequire(import.meta.url), module, module.exports,
);
const { SUPPORTED_OPENCODE_VERSION, isSupportedOpenCodeVersion,
	assertSupportedOpenCodeVersion, OpenCodeCompatibilityError, connectCompatibleService } = module.exports;

const unsupportedVersions = [
	'1.2.2', '2.2.1', '2.2.3', '2.3.0', '3.0.0',
	'2.2.2-beta.1', '2.2.2+untested', 'v2.2.2', ' 2.2.2', '2.2.2\n',
	'', undefined, null, 222, {}, ['2.2.2'],
];

test('version policy accepts only the tested exact runtime', () => {
	assert.equal(SUPPORTED_OPENCODE_VERSION, '2.2.2');
	assert.equal(isSupportedOpenCodeVersion('2.2.2'), true);
	assert.doesNotThrow(() => assertSupportedOpenCodeVersion('2.2.2'));
	for (const version of unsupportedVersions) {
		assert.equal(isSupportedOpenCodeVersion(version), false);
		assert.throws(() => assertSupportedOpenCodeVersion(version), OpenCodeCompatibilityError);
	}
});

function mockSharedService(version) {
	const service = { pid: 42000, version, running: true };
	const mutations = [];
	return {
		service, mutations,
		dependencies: {
			discover: async () => ({ kind: 'found', service }),
			startWhenAbsent: async () => {
				mutations.push('replace');
				service.pid += 1;
				service.version = '2.2.2';
				return service;
			},
		},
	};
}

test('an incompatible shared service is never restarted or replaced, even on retry', async () => {
	for (const version of unsupportedVersions) {
		const { service, mutations, dependencies } = mockSharedService(version);
		const original = { ...service };
		for (let retry = 0; retry < 3; retry++) {
			await assert.rejects(connectCompatibleService(dependencies), OpenCodeCompatibilityError);
		}
		assert.deepEqual(service, original);
		assert.deepEqual(mutations, []);
	}
});

test('compatible shared service is reused without invoking startup', async () => {
	const { service, mutations, dependencies } = mockSharedService('2.2.2');
	assert.equal(await connectCompatibleService(dependencies), service);
	assert.deepEqual(mutations, []);
});

test('discovery errors are propagated, never interpreted as absence', async () => {
	for (const reason of ['unreadable', 'malformed', 'unauthenticated', 'unhealthy', 'identity changed']) {
		const { mutations, dependencies } = mockSharedService('2.2.2');
		const error = new Error(reason);
		dependencies.discover = async () => { throw error; };
		await assert.rejects(connectCompatibleService(dependencies), (actual) => actual === error);
		assert.deepEqual(mutations, []);
	}
});

test('only explicit absence admits startup and the returned version is checked', async () => {
	for (const version of ['2.2.2', '2.2.3', undefined]) {
		let starts = 0;
		const service = { version };
		const result = connectCompatibleService({
			discover: async () => ({ kind: 'absent' }),
			startWhenAbsent: async () => { starts++; return service; },
		});
		if (version === '2.2.2') assert.equal(await result, service);
		else await assert.rejects(result, OpenCodeCompatibilityError);
		assert.equal(starts, 1);
	}
});

test('startup failure is propagated without automatic retry', async () => {
	let starts = 0;
	const error = new Error('startup failed');
	await assert.rejects(connectCompatibleService({
		discover: async () => ({ kind: 'absent' }),
		startWhenAbsent: async () => { starts++; throw error; },
	}), (actual) => actual === error);
	assert.equal(starts, 1);
});

test('compatibility errors contain recovery guidance, not untrusted values or secrets', async () => {
	const secret = 'secret-service-password';
	for (const version of [secret, { toString() { throw new Error('must not coerce'); } }]) {
		const { dependencies } = mockSharedService(version);
		await assert.rejects(connectCompatibleService(dependencies), (error) => {
			assert.ok(error instanceof OpenCodeCompatibilityError);
			assert.match(error.message, /exactly 2\.2\.2/);
			assert.match(error.message, /No automatic restart or replacement/);
			assert.match(error.message, /update the plugin, then retry/);
			assert.ok(!JSON.stringify(error).includes(secret));
			assert.ok(!error.stack.includes(secret));
			return true;
		});
	}
});
