import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import { isAbsolute } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: ['src/opencode/state-directory.ts'], bundle: true, format: 'cjs',
	platform: 'node', write: false,
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => require(name), module, module.exports,
);
const { managedStateDirectory } = module.exports;

test('managed state lives per vault outside the vault directory', () => {
	const one = managedStateDirectory('C:\\Notes');
	const two = managedStateDirectory('C:\\Other');
	assert.ok(isAbsolute(one));
	assert.notEqual(one, two, 'Different vaults do not share state');
	assert.equal(one, managedStateDirectory('C:\\Notes'), 'The path is stable');
	assert.ok(!one.startsWith('C:\\Notes'), 'The state directory is not inside the vault');
	assert.match(one, /opencode-obsidian/);
});

test('an empty vault root still resolves a private directory', () => {
	const path = managedStateDirectory('');
	assert.ok(isAbsolute(path));
	assert.ok(!path.endsWith('opencode-obsidian'), 'The hash directory is appended');
});
