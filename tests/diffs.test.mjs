import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
	stdin: { contents: `export * from './src/opencode/diffs';
		export * from './src/opencode/diff-bounds';
		export * from './src/opencode/diff-shapes';
		export * from './src/opencode/sessions';
		export * from './src/opencode/errors';
		export * from './src/opencode/compatibility';`,
	resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', write: false,
});
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	createRequire(import.meta.url), module, module.exports,
);
const {
	DiffAccessor, conversationBounds, turnBounds, isOutsideVaultPath, validateFileDiffs,
	SessionError, ConnectionError, OpenCodeApiCompatibilityError,
} = module.exports;

const assistant = (id = 'a', snapshot) => ({
	id, type: 'assistant', agent: 'build', model: { providerID: 'p', id: 'm' },
	time: { created: 1, completed: 2 }, content: [{ type: 'text', text: 'Answer.' }],
	...(snapshot ? { snapshot } : {}),
});
const user = (id) => ({ id, type: 'user', text: 'Prompt.', time: { created: 0 } });
const diff = (file, extra = {}) => ({
	file, patch: `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new`,
	additions: 1, deletions: 1, status: 'modified', ...extra,
});

function connection(response, calls = []) {
	return {
		signal: new AbortController().signal,
		connect: async () => ({ session: { diff: async (input, options) => {
			calls.push([input, options]);
			return typeof response === 'function' ? response(input) : response;
		} } }),
	};
}

test('turn and conversation bounds use user message IDs, not snapshot hashes', () => {
	const turn = [user('u1'), assistant('a1', { start: 'snap-start', end: 'snap-end', files: ['A.md'] })];
	assert.deepEqual(turnBounds(assistant('a1'), turn), { from: 'u1', to: 'u1' },
		'A turn is bounded by its own user prompt');
	assert.deepEqual(turnBounds(assistant('a2'), [user('u1'), assistant('a1'), assistant('a2')]),
		{ from: 'u1', to: 'u1' }, 'Tool steps after one prompt share the same turn bound');
	assert.deepEqual(turnBounds(assistant('a1'), [assistant('a1')]), {},
		'An assistant without a preceding prompt stays unbounded');
	assert.deepEqual(conversationBounds([
		user('u1'), assistant('a1'), assistant('a2'), user('u2'), assistant('a3'),
	]), { from: 'u1', to: 'u2' }, 'The review spans the first to last user prompt');
	assert.deepEqual(conversationBounds([user('u1')]), { from: 'u1', to: 'u1' },
		'A single prompt bounds to itself');
	assert.deepEqual(conversationBounds([assistant('a1')]), {}, 'No prompt means no bounds');
});

test('outside-vault paths are recognized for the disabled open action', () => {
	for (const path of ['../Outside.md', 'C:\\Vault\\Notes\\A.md', '/tmp/A.md', 'file:///tmp/A.md', '']) {
		assert.equal(isOutsideVaultPath(path), true, `${path || '(empty)'} is outside the vault`);
	}
	for (const path of ['Notes/A.md', 'A.md', 'Notes\\A.md', 'Notes/Sub/A.md']) {
		assert.equal(isOutsideVaultPath(path), false, `${path} is inside the vault`);
	}
});

test('the diff accessor loads, caches by session and bounds, refreshes, and clears on switch', async () => {
	const calls = [];
	const files = [diff('Notes/A.md')];
	const accessor = new DiffAccessor(connection(files, calls));
	assert.equal(accessor.cache.size, 0, 'The view starts with an empty cache');
	assert.deepEqual(Object.keys(accessor).sort(), ['cache', 'connection'],
		'The accessor has no persistence hook or transcript store');
	assert.equal(typeof accessor.saveData, 'undefined');
	assert.deepEqual(await accessor.load('s1', { from: 'a', to: 'b' }), files);
	assert.equal(calls.length, 1);
	assert.deepEqual(await accessor.load('s1', { from: 'a', to: 'b' }), files);
	assert.equal(calls.length, 1, 'A repeated turn request is served from memory');
	assert.equal(accessor.cache.size, 1, 'Only the patch data stays in the view');
	await accessor.load('s1', { from: 'a', to: 'b' }, true);
	assert.equal(calls.length, 2, 'The conversation review bypasses the cache on open');
	await accessor.load('s2', { from: 'a', to: 'b' });
	assert.equal(accessor.cache.size, 2, 'The key includes the session');
	await accessor.load('s1', { from: 'a', to: 'c' });
	assert.equal(accessor.cache.size, 3, 'The key includes both bounds');
	accessor.clear();
	assert.equal(accessor.cache.size, 0, 'Switching conversation evicts every entry');
});

test('the accessor passes bounds with the request and maps failures to fixed errors', async () => {
	const calls = [];
	const files = [diff('A.md')];
	const accessor = new DiffAccessor(connection(files, calls));
	await accessor.load('session', { from: 'start', to: 'end' });
	assert.deepEqual(calls[0][0], { sessionID: 'session', from: 'start', to: 'end' });

	const missing = new DiffAccessor({ signal: new AbortController().signal, connect: async () => ({
		session: { diff: async () => { throw { _tag: 'SessionNotFoundError', sessionID: 'session' }; } },
	}) });
	await assert.rejects(missing.load('session'),
		(error) => error instanceof SessionError && /may no longer exist/.test(error.message));

	const offline = new DiffAccessor({
		signal: new AbortController().signal,
		connect: async () => { throw new ConnectionError('transport'); },
	});
	await assert.rejects(offline.load('session'), (error) => error instanceof ConnectionError);

	const privateFailure = new DiffAccessor({ signal: new AbortController().signal, connect: async () => ({
		session: { diff: async () => { throw new Error('private upstream detail'); } },
	}) });
	await assert.rejects(privateFailure.load('session'), (error) => error instanceof ConnectionError
		&& !error.message.includes('private upstream detail'));

	assert.throws(() => validateFileDiffs([{ file: '', patch: '', additions: 0, deletions: 0, status: 'modified' }]),
		(error) => error instanceof OpenCodeApiCompatibilityError);
	assert.throws(() => validateFileDiffs([{ file: 'A.md', patch: '', additions: -1, deletions: 0, status: 'modified' }]),
		(error) => error instanceof OpenCodeApiCompatibilityError);
	assert.throws(() => validateFileDiffs([{ file: 'A.md', patch: '', additions: 0, deletions: 0, status: 'renamed' }]),
		(error) => error instanceof OpenCodeApiCompatibilityError);
	assert.throws(() => validateFileDiffs([{ file: 'A.md', patch: '', additions: 0, deletions: 0,
		status: 'modified', more: false }]), (error) => error instanceof OpenCodeApiCompatibilityError);
	assert.equal(validateFileDiffs([diff('A.md', { more: true })])[0].more, true);
});
