import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { OpenCode } from '@opencode/client';

const bundle = await build({ entryPoints: ['src/state/event-ingestion.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url), module, module.exports);
const { EventIngestion } = module.exports;
const root = 'C:\\Notes vault';
let identity = 0;
const event = (type, data = {}, options = {}) => ({ id: `event-${++identity}`, created: identity,
	type: `session.${type}`, location: { directory: root }, data: { sessionID: 'one', ...data }, ...options });
const durable = (seq, aggregateID = 'one') => ({ durable: { aggregateID, seq, version: 1 } });
const step = (id = 'assistant', seq = 1) => event('step.started', { assistantMessageID: id,
	agent: 'general', model: { providerID: 'fixture', id: 'fixture' }, started: 10 }, durable(seq));
const part = (type, data = {}, options = {}) => event(type, { assistantMessageID: 'assistant', ordinal: 0, ...data }, options);
function fixture(t, limits = {}, messages = []) {
	const recoveries = [];
	const sink = new EventIngestion(root, 'one', messages, (reason) => recoveries.push(reason), limits);
	t.after(() => sink.dispose());
	return { sink, recoveries };
}
function apply(sink, ...events) { for (const e of events) sink.ingest(e); sink.drain(); }

test('text deltas compose by message/ordinal and final text replaces rather than duplicates', (t) => {
	const { sink, recoveries } = fixture(t);
	apply(sink, step(), part('text.started', {}, durable(2)), part('text.delta', { delta: '[[No' }),
		part('text.delta', { delta: 'te]]' }), part('text.ended', { text: '[[Note]] final' }, durable(3)));
	assert.deepEqual(sink.state.messages[0].content, [{ type: 'text', text: '[[Note]] final' }]);
	assert.deepEqual(recoveries, []);
});

test('reduced batches notify presentation outside fast ingestion', (t) => {
	let notifications = 0;
	const sink = new EventIngestion(root, 'one', [], () => {}, {}, 'unknown', () => { notifications++; });
	t.after(() => sink.dispose());
	sink.ingest(step());
	sink.ingest(part('text.started', {}, durable(2)));
	sink.ingest(part('text.delta', { delta: 'visible before completion' }));
	assert.equal(notifications, 0);
	sink.drain();
	assert.equal(notifications, 1);
	assert.equal(sink.state.messages[0].content[0].text, 'visible before completion');
	sink.drain();
	assert.equal(notifications, 1, 'Empty drains do not create render work');
});

test('2.3.2 first-token timing preserves durable order and incremental text with the pinned client', (t) => {
	const { sink, recoveries } = fixture(t);
	apply(sink, step(), event('step.first-token', { assistantMessageID: 'assistant' }, durable(2)),
		part('text.started', {}, durable(3)), part('text.delta', { delta: 'answer' }),
		part('text.ended', { text: 'answer' }, durable(4)));
	assert.equal(sink.state.messages[0].content[0].text, 'answer');
	assert.deepEqual(recoveries, []);
});

test('first-token timing for a missing message discards uncertain state', (t) => {
	const { sink, recoveries } = fixture(t);
	apply(sink, event('step.first-token', { assistantMessageID: 'missing' }, durable(1)));
	assert.equal(sink.state, undefined);
	assert.deepEqual(recoveries, ['unsupported-mutation']);
});

test('multiple messages and interleaved reasoning/text use exact content identities', (t) => {
	const { sink } = fixture(t);
	apply(sink, step(), part('reasoning.started', {}, durable(2)), part('text.started', { ordinal: 1 }, durable(3)),
		part('reasoning.delta', { delta: 'reason' }), part('text.delta', { ordinal: 1, delta: 'answer' }), step('second', 4),
		part('text.started', { assistantMessageID: 'second' }, durable(5)),
		part('text.delta', { assistantMessageID: 'second', delta: 'next' }));
	assert.deepEqual(sink.state.messages.map((m) => m.content.map((c) => c.text)), [['reason', 'answer'], ['next']]);
});

test('execution outcomes retain exact failure and interruption without interpreting idle as success', (t) => {
	const { sink } = fixture(t);
	const error = { type: 'unknown', message: 'fixture failure' };
	for (const [type, data, expected] of [['started', {}, 'running'], ['failed', { error }, 'failed'],
		['started', {}, 'running'], ['interrupted', { reason: 'user' }, 'interrupted'], ['succeeded', {}, 'succeeded']]) {
		apply(sink, event(`execution.${type}`, data));
		assert.equal(sink.state.execution, expected);
		assert.deepEqual(sink.state.error, expected === 'failed' ? error : undefined);
	}
	apply(sink, event('status', { status: { type: 'retry', attempt: 1, message: 'retrying', next: 100 } }));
	assert.equal(sink.state.status.type, 'retry');
	apply(sink, event('idle'));
	assert.equal(sink.state.status.type, 'idle');
	assert.equal(sink.state.execution, 'succeeded');
});

test('step completion is separate from execution outcome and records final message metadata', (t) => {
	const { sink } = fixture(t);
	apply(sink, event('execution.started'), step(), event('step.streamed', { assistantMessageID: 'assistant' }, durable(2)),
		event('step.ended', { assistantMessageID: 'assistant', finish: 'stop', cost: 0,
			tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, durable(3)));
	assert.equal(sink.state.execution, 'running');
	assert.equal(sink.state.messages[0].finish, 'stop');
	assert.ok(sink.state.messages[0].time.completed);
});

test('live step snapshots keep the turn bounds and changed files used by the diff review', (t) => {
	const { sink, recoveries } = fixture(t);
	const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
	apply(sink,
		event('step.started', { assistantMessageID: 'assistant', agent: 'general',
			model: { providerID: 'fixture', id: 'fixture' }, started: 10, snapshot: 'start-1' }, durable(1)),
		event('step.ended', { assistantMessageID: 'assistant', finish: 'stop', cost: 0, tokens,
			snapshot: 'end-1', files: ['Notes/A.md'] }, durable(2)));
	assert.deepEqual(sink.state.messages[0].snapshot,
		{ start: 'start-1', end: 'end-1', files: ['Notes/A.md'] },
		'A completed live turn carries the bounds and files the turn review needs');

	apply(sink,
		event('step.started', { assistantMessageID: 'failed', agent: 'general',
			model: { providerID: 'fixture', id: 'fixture' }, started: 20, snapshot: 'start-2' }, durable(3)),
		event('step.failed', { assistantMessageID: 'failed', error: { type: 'unknown', message: 'fixture failure' },
			snapshot: 'end-2', files: ['Notes/B.md'] }, durable(4)));
	assert.deepEqual(sink.state.messages[1].snapshot,
		{ start: 'start-2', end: 'end-2', files: ['Notes/B.md'] },
		'A failed live turn keeps its partial change record');
	assert.deepEqual(recoveries, []);
});

test('other sessions, projects, nested vaults and global notifications cannot mutate or fill the queue', (t) => {
	const { sink, recoveries } = fixture(t, { maxEvents: 1 });
	for (let i = 0; i < 10; i++) {
		sink.ingest(event('execution.started', { sessionID: 'other' }));
		sink.ingest(event('execution.started', {}, { location: { directory: root + '\\child' } }));
		sink.ingest(event('execution.started', {}, { location: { directory: 'C:\\Other' } }));
		sink.ingest({ id: `global-${i}`, type: 'server.connected', created: i, data: {} });
	}
	assert.equal(sink.pendingCount, 0);
	assert.equal(sink.state.execution, 'unknown');
	assert.deepEqual(recoveries, []);
	apply(sink, event('execution.started', {}, { location: undefined }));
	assert.equal(sink.state.execution, 'running'); // Optional location; selected session identity still scopes it.
});

test('Windows path aliases are accepted without prefix-based cross-vault leakage', (t) => {
	const { sink } = fixture(t);
	apply(sink, event('execution.started', {}, { location: { directory: 'c:/notes vault/' } }));
	assert.equal(sink.state.execution, 'running');
});

test('duplicate event IDs before and after drain are ignored, but equal text under new IDs is retained', (t) => {
	const { sink } = fixture(t);
	const start = part('text.started', {}, durable(2));
	const delta = part('text.delta', { delta: 'ha' });
	apply(sink, step(), start, start, delta, delta);
	apply(sink, delta, part('text.delta', { delta: 'ha' }));
	assert.equal(sink.state.messages[0].content[0].text, 'haha');
});

test('count overflow discards partial projection, bounds queue, and requests recovery once outside ingestion', (t) => {
	const { sink, recoveries } = fixture(t, { maxEvents: 2 });
	sink.ingest(step()); sink.ingest(part('text.started'));
	assert.equal(sink.pendingCount, 2);
	sink.ingest(part('text.delta', { delta: 'lost' }));
	assert.equal(sink.state, undefined);
	assert.equal(sink.pendingCount, 0);
	assert.deepEqual(recoveries, []);
	for (let i = 0; i < 100; i++) sink.ingest(event('execution.succeeded'));
	sink.drain(); sink.drain();
	assert.deepEqual(recoveries, ['queue-overflow']);
});

test('payload-size bound rejects an individually oversized event', (t) => {
	const { sink, recoveries } = fixture(t, { maxCharacters: 256 });
	sink.ingest(part('text.delta', { delta: 'x'.repeat(1024) })); sink.drain();
	assert.equal(sink.state, undefined);
	assert.deepEqual(recoveries, ['queue-overflow']);
});

test('payload budget accounts for the entire queue and releases capacity after draining', (t) => {
	const first = event('execution.started');
	const second = event('execution.succeeded');
	const budget = JSON.stringify(first).length + JSON.stringify(second).length - 1;
	const { sink, recoveries } = fixture(t, { maxCharacters: budget });
	apply(sink, first);
	apply(sink, second);
	assert.equal(sink.state.execution, 'succeeded');
	sink.ingest(event('execution.started'));
	sink.ingest(event('execution.succeeded'));
	sink.drain();
	assert.equal(sink.state, undefined);
	assert.deepEqual(recoveries, ['queue-overflow']);
});

test('deduplication history is bounded without forgetting IDs and risking duplicate deltas', (t) => {
	const { sink, recoveries } = fixture(t, { maxIdentities: 2 });
	const first = event('execution.started');
	apply(sink, first, event('execution.succeeded'));
	apply(sink, first);
	assert.equal(sink.state.execution, 'succeeded');
	apply(sink, event('execution.started'));
	assert.equal(sink.state, undefined);
	assert.deepEqual(recoveries, ['identity-capacity']);
});

test('unknown lower/equal durable sequence requires recovery; sequence gaps are not guessed missing events', (t) => {
	for (const seq of [9, 10]) {
		const { sink, recoveries } = fixture(t);
		apply(sink, event('execution.started', {}, durable(10)), event('execution.succeeded', {}, durable(seq)));
		assert.equal(sink.state, undefined);
		assert.deepEqual(recoveries, ['uncertain-order']);
	}
	const { sink } = fixture(t);
	apply(sink, event('execution.started', {}, durable(10)), event('execution.succeeded', {}, durable(20)));
	assert.equal(sink.state.execution, 'succeeded');
});

test('missing starts, unknown ordinals, late deltas, and snapshot overlap fail closed', (t) => {
	const cases = [
		[[], [part('text.delta', { delta: 'missing' })]],
		[[], [step(), part('text.started'), part('text.delta', { ordinal: 2, delta: 'wrong' })]],
		[[], [step(), part('text.started'), part('text.ended', { text: 'done' }), part('text.delta', { delta: 'late' })]],
		[[{ id: 'assistant', type: 'assistant', content: [{ type: 'text', text: 'saved' }], time: { created: 1 } }], [step()]],
	];
	for (const [messages, events] of cases) {
		const { sink, recoveries } = fixture(t, {}, messages);
		apply(sink, ...events);
		assert.equal(sink.state, undefined);
		assert.equal(recoveries.length, 1);
	}
});

test('session moves and not-yet-reduced interactions request authoritative recovery, never auto-answer', (t) => {
	for (const e of [event('moved', { location: { directory: '/other' }, projectID: 'other' }, { location: { directory: '/other' } }),
		{ ...event('unused'), type: 'permission.asked', data: { id: 'p', sessionID: 'one', action: 'read', resources: [] } },
		{ ...event('unused'), type: 'form.created', data: { form: { id: 'f', sessionID: 'one', fields: {} } } }]) {
		const { sink, recoveries } = fixture(t);
		apply(sink, e);
		assert.equal(sink.state, undefined);
		assert.equal(recoveries.length, 1);
	}
});

test('reduction is deferred and CPU batches are bounded independently of presentation', (t) => {
	const { sink } = fixture(t, { batchSize: 1 });
	sink.ingest(event('execution.started')); sink.ingest(event('execution.succeeded'));
	assert.equal(sink.state.execution, 'unknown');
	sink.drain();
	assert.equal(sink.state.execution, 'running'); assert.equal(sink.pendingCount, 1);
	sink.drain();
	assert.equal(sink.state.execution, 'succeeded'); assert.equal(sink.pendingCount, 0);
});

test('scheduled batches reduce automatically and recovery notification is deferred without a renderer', async (t) => {
	const { sink, recoveries } = fixture(t);
	sink.ingest(event('execution.started'));
	await delay(10);
	assert.equal(sink.state.execution, 'running');
	sink.ingest(part('text.delta', { delta: 'no known start' }));
	assert.deepEqual(recoveries, []);
	await delay(10);
	assert.equal(sink.state, undefined);
	assert.equal(recoveries.length, 1);
});

test('disposal cancels scheduled work and suppresses late recovery callbacks', async (t) => {
	const { sink, recoveries } = fixture(t, { maxEvents: 1 });
	sink.ingest(step()); sink.ingest(part('text.started')); sink.dispose();
	sink.ingest(event('execution.started')); sink.drain();
	await delay(5);
	assert.equal(sink.pendingCount, 0); assert.equal(sink.state, undefined);
	assert.deepEqual(recoveries, []);
});

test('live iterable consumption never awaits rendering and requests recovery on source end/failure', async (t) => {
	for (const fail of [false, true]) {
		const { sink, recoveries } = fixture(t);
		async function* source() {
			yield event('execution.started');
			assert.equal(sink.state.execution, 'unknown'); // No reduction/render await in the iterator.
			if (fail) throw new Error('fixture disconnect');
		}
		const pending = sink.consume(source(), new AbortController().signal);
		if (fail) await assert.rejects(pending, /fixture disconnect/); else await pending;
		sink.drain();
		assert.equal(sink.state, undefined); assert.deepEqual(recoveries, ['stream-ended']);
	}
});

test('abort-bound iterator cancellation is not a recovery or server interrupt', async (t) => {
	const { sink, recoveries } = fixture(t);
	const controller = new AbortController();
	controller.abort();
	await sink.consume((async function* () { yield event('execution.started'); })(), controller.signal);
	sink.drain();
	assert.equal(sink.pendingCount, 0); assert.deepEqual(recoveries, []);
});

test('tool lifecycle events reduce into compact inspectable entries without recovery churn', (t) => {
	const { sink, recoveries } = fixture(t);
	apply(sink, step(), event('tool.input.started', { assistantMessageID: 'assistant', id: 'tool-1', name: 'read' }, durable(2)),
		event('tool.input.delta', { assistantMessageID: 'assistant', id: 'tool-1', delta: '{"path":' }),
		event('tool.input.ended', { assistantMessageID: 'assistant', id: 'tool-1', text: '{"path":"a"}' }, durable(3)),
		event('tool.called', { assistantMessageID: 'assistant', id: 'tool-1', input: { path: 'a' }, executed: true }, durable(4)));
	const tool = sink.state.messages[0].content[0];
	assert.equal(tool.type, 'tool');
	assert.equal(tool.state.status, 'running');
	apply(sink, event('tool.progress', { assistantMessageID: 'assistant', id: 'tool-1', metadata: { percent: 50 } }),
		event('tool.success', { assistantMessageID: 'assistant', id: 'tool-1', content: [{ type: 'text', text: 'ok' }], executed: true }, durable(5)));
	assert.equal(sink.state.messages[0].content[0].state.status, 'completed');
	apply(sink, step('second', 6), event('tool.input.started', { assistantMessageID: 'second', id: 'tool-2', name: 'write' }, durable(7)),
		event('tool.failed', { assistantMessageID: 'second', id: 'tool-2', error: { type: 'unknown', message: 'nope' },
			content: [{ type: 'text', text: 'failure detail' }], executed: true }, durable(8)));
	const failed = sink.state.messages[1].content[0];
	assert.equal(failed.state.status, 'error');
	assert.equal(failed.state.error.message, 'nope');
	assert.deepEqual(recoveries, []);
});

test('session-scoped notifications admit without recovery churn during a live answer', (t) => {
	const { sink, recoveries } = fixture(t);
	const tokens = { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } };
	apply(sink, event('execution.started'),
		event('usage.updated', { cost: 0.001, tokens }),
		event('retry.scheduled', { assistantMessageID: 'assistant', attempt: 1, at: 10,
			error: { type: 'unknown', message: 'retry' } }, durable(2)),
		event('usage.updated', { cost: 0.002, tokens }));
	assert.equal(sink.state.execution, 'running');
	assert.deepEqual(recoveries, []);
});

test('a genuinely unsupported session mutation still requests authoritative recovery', (t) => {
	const { sink, recoveries } = fixture(t);
	apply(sink, event('execution.started'),
		event('message.content.updated', { messageID: 'assistant', content: [] }, durable(2)));
	assert.equal(sink.state, undefined);
	assert.deepEqual(recoveries, ['unsupported-mutation']);
});

test('pinned client decodes native SSE event identities/envelopes into the ingestion boundary', async (t) => {
	const { sink } = fixture(t);
	const controller = new AbortController();
	const events = [step(), part('text.started', {}, durable(2)), part('text.delta', { delta: 'fixture' })];
	const client = OpenCode.make({ baseUrl: 'http://127.0.0.1:4096', fetch: async () => new Response(
		new ReadableStream({ start(output) {
			for (const e of events) output.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
			// Keep live until subscriber cancellation; EOF is intentionally an uncertainty signal.
		} }), { headers: { 'content-type': 'text/event-stream' } }) });
	let count = 0;
	for await (const e of client.event.subscribe({ signal: controller.signal })) {
		sink.ingest(e);
		if (++count === events.length) { controller.abort(); break; }
	}
	sink.drain();
	assert.equal(sink.state.messages[0].content[0].text, 'fixture');
});

test('live step start and completion retain snapshot bounds and changed files for the turn review', (t) => {
	const { sink, recoveries } = fixture(t);
	apply(sink,
		event('step.started', { assistantMessageID: 'assistant', agent: 'general',
			model: { providerID: 'fixture', id: 'fixture' }, started: 10, snapshot: 'start-1' }, durable(1)),
		event('step.ended', { assistantMessageID: 'assistant', finish: 'stop', cost: 0,
			tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
			snapshot: 'end-1', files: ['Notes/A.md', 'Notes/B.md'] }, durable(2)));
	assert.deepEqual(sink.state.messages[0].snapshot,
		{ start: 'start-1', end: 'end-1', files: ['Notes/A.md', 'Notes/B.md'] });
	assert.deepEqual(recoveries, []);

	apply(sink,
		event('step.started', { assistantMessageID: 'failed', agent: 'general',
			model: { providerID: 'fixture', id: 'fixture' }, started: 20, snapshot: 'start-2' }, durable(3)),
		event('step.failed', { assistantMessageID: 'failed', error: { type: 'unknown', message: 'failed' },
			snapshot: 'end-2', files: ['Notes/C.md'] }, durable(4)));
	const failed = sink.state.messages.find((message) => message.id === 'failed');
	assert.deepEqual(failed.snapshot, { start: 'start-2', end: 'end-2', files: ['Notes/C.md'] });
});
