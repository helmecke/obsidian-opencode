import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

// Exercise the real TypeScript module without generated test files or a new runner.
const bundle = await build({
	stdin: {
		contents: `export * from './src/opencode/compatibility';`,
		resolveDir: process.cwd(), loader: 'ts',
	},
	bundle: true, format: 'cjs', target: 'es2021', write: false,
});
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	createRequire(import.meta.url), module, module.exports,
);
const { SUPPORTED_OPENCODE_VERSION, isSupportedOpenCodeVersion,
	assertSupportedOpenCodeVersion, OpenCodeCompatibilityError, OpenCodeApiCompatibilityError } = module.exports;

const unsupportedVersions = [
	'1.2.2', '2.0.0', '2.1.99', '2.2.1', '3.0.0', '3.0.0-beta.1',
	'2.2.2-beta.1', '2.3.2-rc.1+build', '2.2.2+', '2.2.2+a..b',
	'02.2.2', '2.02.2', '2.2.02', '2.2', '2.2.2.0', '2.9007199254740992.0',
	'v2.2.2', ' 2.2.2', '2.2.2\n',
	'', undefined, null, 222, {}, ['2.2.2'],
];

test('version eligibility accepts stable 2.x from 2.2.2, with valid build metadata', () => {
	assert.equal(SUPPORTED_OPENCODE_VERSION, '>=2.2.2 <3.0.0');
	for (const version of ['2.2.2', '2.2.3', '2.2.4', '2.3.2', '2.99.999', '2.2.2+build.01-a']) {
		assert.equal(isSupportedOpenCodeVersion(version), true);
		assert.doesNotThrow(() => assertSupportedOpenCodeVersion(version));
	}
	for (const version of unsupportedVersions) {
		assert.equal(isSupportedOpenCodeVersion(version), false);
		assert.throws(() => assertSupportedOpenCodeVersion(version), OpenCodeCompatibilityError);
	}
});

test('compatibility errors contain recovery guidance, not untrusted values or secrets', () => {
	const secret = 'secret-service-password';
	for (const version of unsupportedVersions.concat([
		secret, { toString() { throw new Error('must not coerce'); } },
	])) {
		assert.throws(() => assertSupportedOpenCodeVersion(version), (error) => {
			assert.ok(error instanceof OpenCodeCompatibilityError);
			assert.match(error.message, />=2\.2\.2 <3\.0\.0/);
			assert.match(error.message, /No automatic restart or replacement/);
			assert.match(error.message, /update the plugin, then retry/);
			assert.ok(!JSON.stringify(error).includes(secret));
			assert.ok(!error.stack.includes(secret));
			return true;
		});
	}
});

test('API incompatibility error is fixed and keeps sends and decisions disabled', () => {
	const error = new OpenCodeApiCompatibilityError();
	assert.match(error.message, /Sends and decisions are disabled/);
	assert.match(error.message, /will not be restarted or replaced/);
	assert.equal(error.name, 'OpenCodeApiCompatibilityError');
});
