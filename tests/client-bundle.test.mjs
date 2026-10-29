import assert from 'node:assert/strict';
import { builtinModules, createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

test('pinned client and service entrypoints import without starting a service', async () => {
	const { OpenCode } = await import('@opencode/client');
	const { Service } = await import('@opencode/client/service');
	assert.equal(typeof OpenCode.make, 'function');
	assert.equal(typeof Service.discover, 'function');
	assert.equal(typeof Service.ensure, 'function');
	assert.equal(typeof Service.headers, 'function');
});

test('client and service bundle to executable CommonJS with only native externals', async () => {
	const result = await build({
		stdin: {
			contents: `export { OpenCode } from '@opencode/client';
				export { Service } from '@opencode/client/service';`,
			resolveDir: process.cwd(),
			sourcefile: 'client-compatibility.ts',
			loader: 'ts',
		},
		bundle: true,
		format: 'cjs',
		target: 'es2021',
		external: [...builtinModules, 'node:*'],
		write: false,
		metafile: true,
		minify: true,
	});
	assert.equal(result.warnings.length, 0);
	for (const output of Object.values(result.metafile.outputs)) {
		for (const dependency of output.imports) {
			assert.ok(dependency.external);
			assert.ok(builtinModules.includes(dependency.path.replace(/^node:/, '')),
				`Unbundled runtime package: ${dependency.path}`);
		}
	}
	assert.equal(result.outputFiles.length, 1);
	const module = { exports: {} };
	// Execute only our locally built fixture; never call service discovery/startup.
	compileFunction(result.outputFiles[0].text, ['require', 'module', 'exports'])(
		createRequire(import.meta.url), module, module.exports,
	);
	assert.equal(typeof module.exports.OpenCode.make, 'function');
	assert.equal(typeof module.exports.Service.ensure, 'function');
	const client = module.exports.OpenCode.make({
		baseUrl: 'http://127.0.0.1:1',
		fetch: () => { throw new Error('Client construction must not make requests'); },
	});
	assert.equal(typeof client.server.info, 'function');
	assert.equal(typeof client.event.subscribe, 'function');
});
