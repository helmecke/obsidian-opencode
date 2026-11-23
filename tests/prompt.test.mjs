import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/state/prompt-coordinator.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url), module, module.exports);
const { PromptCoordinator, PromptError, createPromptID } = module.exports;

test('default prompt identities satisfy the shared 2.2.2/2.3.2 msg_ schema', async () => {
	const first = createPromptID(), second = createPromptID();
	assert.match(first, /^msg_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.notEqual(first, second);
	let admitted;
	const coordinator = new PromptCoordinator(async () => ({
		session: { prompt: async (input) => {
			assert.ok(input.id.startsWith('msg_'), 'SessionMessage.ID requires this prefix in both reviewed releases');
			admitted = input.id;
			return { id: input.id, sessionID: input.sessionID, type: 'user', payload: { text: input.text } };
		} },
	}), 'session');
	assert.equal((await coordinator.send('synthetic')).id, admitted);
});

function fixture() {
	const prompts = [];
	const messages = [];
	let failNext = false;
	let mismatch = false;
	const client = {
		session: {
			prompt: async (input) => {
				prompts.push(structuredClone(input));
				const fail = failNext;
				const different = mismatch;
				failNext = false;
				mismatch = false;
				if (fail) {
					if (!different) messages.push({ id: input.id, type: 'user', text: input.text, time: { created: 1 } });
					throw new Error('connection lost after admission with private token');
				}
				return { id: different ? 'other' : input.id, sessionID: input.sessionID, type: 'user',
					payload: { text: input.text }, delivery: 'queue' };
			},
		},
		message: { list: async () => ({ data: structuredClone(messages), cursor: {} }) },
	};
	let ids = 0;
	const coordinator = new PromptCoordinator(async () => client, 'session', () => `prompt-${++ids}`);
	return { coordinator, prompts, messages,
		failNext(value, different = false) { failNext = value; mismatch = different; } };
}

test('sending uses one stable prompt ID supplied by the caller and marks admission', async () => {
	const f = fixture();
	const pending = await f.coordinator.send('hello');
	assert.equal(pending.id, 'prompt-1');
	assert.equal(pending.phase, 'admitted');
	assert.deepEqual(f.prompts, [{ sessionID: 'session', id: 'prompt-1', text: 'hello' }]);
});

test('sending attaches resolved skill IDs while keeping the prompt text unchanged', async () => {
	const f = fixture();
	const pending = await f.coordinator.send('use $apply', ['skill-apply']);
	assert.equal(pending.phase, 'admitted');
	assert.deepEqual(pending.skillIDs, ['skill-apply']);
	assert.deepEqual(f.prompts, [{ sessionID: 'session', id: 'prompt-1', text: 'use $apply',
		skills: [{ id: 'skill-apply' }] }]);
});

test('prompts without skills omit the skills field', async () => {
	const f = fixture();
	const pending = await f.coordinator.send('plain');
	assert.equal(pending.skillIDs, undefined);
	assert.equal('skills' in f.prompts[0], false);
});

test('retry reuses the same prompt identity and skill IDs after a genuine loss', async () => {
	const f = fixture();
	f.failNext(true, true); // failure without recording an admitted message
	await assert.rejects(f.coordinator.send('use $apply', ['skill-apply', 'skill-build']), PromptError);
	assert.equal(f.coordinator.pending.phase, 'uncertain');
	await f.coordinator.retry();
	assert.deepEqual(f.prompts.map((prompt) => prompt.id), ['prompt-1', 'prompt-1']);
	assert.deepEqual(f.prompts.map((prompt) => prompt.skills),
		[[{ id: 'skill-apply' }, { id: 'skill-build' }], [{ id: 'skill-apply' }, { id: 'skill-build' }]]);
	assert.equal(f.coordinator.pending.phase, 'admitted');
});

test('lost acknowledgment retains the prompt and reconciles an admitted message without resending', async () => {
	const f = fixture();
	f.failNext(true);
	await assert.rejects(f.coordinator.send('recover me'), PromptError);
	assert.equal(f.coordinator.pending.phase, 'uncertain');
	assert.equal(f.coordinator.pending.text, 'recover me');
	const reconciled = await f.coordinator.reconcile();
	assert.equal(reconciled.phase, 'admitted');
	await f.coordinator.retry();
	assert.equal(f.prompts.length, 1, 'An admitted message must never be sent again');
	assert.equal(f.prompts[0].id, 'prompt-1');
});

test('retry after a genuine loss reuses the same identity, never a new prompt', async () => {
	const f = fixture();
	f.failNext(true, true); // failure without recording an admitted message
	await assert.rejects(f.coordinator.send('may not have arrived'), PromptError);
	assert.equal(f.coordinator.pending.phase, 'uncertain');
	await f.coordinator.retry();
	assert.deepEqual(f.prompts.map((prompt) => prompt.id), ['prompt-1', 'prompt-1']);
	assert.equal(f.coordinator.pending.phase, 'admitted');
});

test('a mismatched acknowledgment is uncertain and cannot be treated as success', async () => {
	const f = fixture();
	f.failNext(false, true);
	await assert.rejects(f.coordinator.send('wrong ack'), PromptError);
	assert.equal(f.coordinator.pending.phase, 'uncertain');
	assert.equal((await f.coordinator.reconcile()).phase, 'uncertain');
});

test('empty input, concurrent sends, and uncertain retries are rejected explicitly', async () => {
	const f = fixture();
	await assert.rejects(f.coordinator.send('   '), (error) => error.code === 'empty');
	let finish;
	const slow = { session: { prompt: async () => new Promise((resolve) => { finish = resolve; }) } };
	const coordinator = new PromptCoordinator(async () => slow, 'session', () => 'stable');
	const sending = coordinator.send('first');
	await assert.rejects(coordinator.send('second'), (error) => error.code === 'busy');
	finish({ id: 'stable', sessionID: 'session', type: 'user', payload: { text: 'first' }, delivery: 'queue' });
	await sending;
	f.failNext(true);
	await assert.rejects(f.coordinator.send('a'), PromptError);
	await assert.rejects(f.coordinator.send('b'), (error) => error.code === 'uncertain');
});

test('the idle gate reuses busy and uncertain rules without creating a prompt identity', async () => {
	const f = fixture();
	assert.doesNotThrow(() => f.coordinator.assertIdle(), 'No pending prompt is idle');
	let finish;
	const slow = { session: { prompt: async () => new Promise((resolve) => { finish = resolve; }) } };
	let ids = 0;
	const coordinator = new PromptCoordinator(async () => slow, 'session', () => `gate-${++ids}`);
	const sending = coordinator.send('first');
	for (let index = 0; index < 5; index++) await Promise.resolve();
	assert.throws(() => coordinator.assertIdle(), (error) => error.code === 'busy');
	finish({ id: 'gate-1', sessionID: 'session', type: 'user', payload: { text: 'first' }, delivery: 'queue' });
	await sending;
	assert.doesNotThrow(() => coordinator.assertIdle(), 'An admitted prompt does not block');
	assert.equal(coordinator.pending, undefined, 'The gate settles a confirmed prompt');

	f.failNext(true);
	await assert.rejects(f.coordinator.send('lost'), PromptError);
	assert.throws(() => f.coordinator.assertIdle(), (error) => error.code === 'uncertain');
	assert.equal(f.coordinator.pending.text, 'lost', 'The gate never creates or replaces an identity');
	assert.equal(f.prompts.length, 1, 'The gate sends no prompt request');
});

test('a confirmed prompt is settled before the next send; uncertain text is only returned explicitly', async () => {
	const f = fixture();
	await f.coordinator.send('first');
	await f.coordinator.send('second');
	assert.deepEqual(f.prompts.map((prompt) => prompt.id), ['prompt-1', 'prompt-2']);
	f.failNext(true);
	await assert.rejects(f.coordinator.send('uncertain text'), PromptError);
	f.coordinator.discard();
	assert.equal(f.coordinator.pending.text, 'uncertain text', 'Uncertain text must not be discarded silently');
});
