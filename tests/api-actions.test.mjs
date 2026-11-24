import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { OpenCode } from '@opencode/client';

const bundle = await build({ entryPoints: ['src/opencode/api-contract.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	createRequire(import.meta.url), module, module.exports);
const { withApiValidation, OpenCodeApiCompatibilityError } = module.exports;

const fixture = (status, body) => withApiValidation(OpenCode.make({
	baseUrl: 'http://127.0.0.1:4096',
	fetch: async () => Response.json(body, { status }),
}));
const actions = (client) => [
	() => client.permission.reply({ sessionID: 's', requestID: 'p', decision: 'once' }),
	() => client.session.form.reply({ sessionID: 's', formID: 'f', answer: { choice: 'a' } }),
	() => client.session.form.cancel({ sessionID: 's', formID: 'f' }),
	() => client.session.switchAgent({ sessionID: 's', agent: 'build' }),
	() => client.session.switchModel({ sessionID: 's', model: { providerID: 'p', id: 'm' } }),
	() => client.session.update({ sessionID: 's', title: 'Synthetic' }),
	() => client.session.prompt({ sessionID: 's', id: 'prompt', text: 'synthetic' }),
];

test('unsupported mutation endpoints propagate compatibility errors without automatic retries', async () => {
	for (const action of actions(fixture(405, { message: 'private upstream detail' }))) {
		await assert.rejects(action(), (error) => error instanceof OpenCodeApiCompatibilityError
			&& !error.message.includes('private upstream detail'));
	}
});

test('server answer validation and authentication failures are not API incompatibility', async () => {
	for (const status of [400, 422, 401, 403]) {
		for (const action of actions(fixture(status, { message: 'Request rejected' }))) {
			await assert.rejects(action(), (error) => !(error instanceof OpenCodeApiCompatibilityError));
		}
	}
});

test('malformed interruption acknowledgement is not a confirmed stop', async () => {
	await assert.rejects(fixture(200, { interrupted: 'yes' }).session.interrupt({ sessionID: 's' }),
		OpenCodeApiCompatibilityError);
	assert.deepEqual(await fixture(200, { interrupted: false }).session.interrupt({ sessionID: 's' }),
		{ interrupted: false });
});
