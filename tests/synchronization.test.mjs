import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { OpenCode } from '@opencode/client';

const bundle = await build({ stdin: { contents: `export * from './src/state/synchronization';
	export * from './src/opencode/compatibility';`, resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url), module, module.exports);
const { SynchronizationCoordinator } = module.exports;
const { OpenCodeApiCompatibilityError } = module.exports;
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const root = 'C:\\Vault';
let eventID = 0;
const event = (type, data = {}, directory = root) => ({ id: `e${++eventID}`, created: 10, type,
	...(/^session\.(inbox|execution|step)\.|^session\.(agent|model)\.selected$/.test(type)
		? { durable: { aggregateID: 'one', seq: eventID, version: 1 } } : {}),
	location: { directory }, data: { sessionID: 'one', ...data } });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function fixture(policy = {}) {
	const lifetime = new AbortController();
	const jobs = new Map();
	let jobID = 0;
	const clock = { set: (callback, delay) => { const id = ++jobID; jobs.set(id, { callback, delay }); return id; }, clear: (id) => jobs.delete(id) };
	const streams = [];
	const calls = [];
	let snapshots = 0;
	let invalidations = 0;
	let selected = { id: 'one', location: { directory: root }, outcome: 'succeeded' };
	let messages = [{ id: 'answer', type: 'assistant', content: [{ type: 'text', text: 'answer' }], time: { created: 1, completed: 2 } }];
	let skills = [
		{ id: 'skill-apply', name: 'apply', description: 'Apply a change', path: 'C:\\Vault\\skills\\apply.md', content: '# apply' },
		{ id: 'skill-build', name: 'build', path: 'C:\\Vault\\skills\\build.md', content: '# build' },
	];
	let commands = [
		{ name: 'review', description: 'Review the working tree' },
		{ name: 'team/review' },
		{ name: 'broken' },
	];
	let failNextPrompt = false;
	const client = {
		agent: { list: async () => ({ data: [] }) },
		model: { list: async () => ({ data: [] }) },
		skill: { list: async (input) => { calls.push(['skills', input]); return { location: { directory: root }, data: skills }; } },
		command: { list: async (input) => { calls.push(['commands', input]); return { location: { directory: root }, data: commands }; } },
		message: { list: async () => ({ data: structuredClone(messages), cursor: {} }) },
		event: { subscribe({ signal }) {
			calls.push('subscribe');
			const queue = [event('server.connected')];
			let wake;
			let done = false;
			const stream = { signal, push(value) { queue.push(value); wake?.(); }, end() { done = true; wake?.(); } };
			streams.push(stream);
			signal.addEventListener('abort', () => stream.end(), { once: true });
			return { async *[Symbol.asyncIterator]() {
				while (!done) {
					if (queue.length) yield queue.shift();
					else await new Promise((resolve) => { wake = resolve; });
				}
			} };
		} },
		session: {
			active: async ({ signal }) => { calls.push(['active', signal]); return f.active; },
			form: { list: async (input, { signal }) => { calls.push(['forms', input, signal]); return f.forms; } },
			prompt: async (input) => {
				calls.push(['prompt', structuredClone(input)]);
				if (failNextPrompt) { failNextPrompt = false; throw new Error('lost ack'); }
				return { id: input.id, sessionID: input.sessionID, type: 'user', payload: { text: input.text }, delivery: 'queue' };
			},
			command: async (input) => {
				calls.push(['command', structuredClone(input)]);
				if (input.name === 'broken') throw new Error('rejected by the service');
			},
		},
		permission: { list: async (input, { signal }) => { calls.push(['permissions', input, signal]); return f.permissions; } },
	};
	const sessions = {
		vaultRoot: root,
		selectedID: 'one',
		async open(signal) {
			calls.push(['snapshot', signal]); snapshots++;
			const result = structuredClone({ selected, messages, sessions: [selected] });
			await f.duringSnapshot?.(snapshots, signal);
			return result;
		},
		async refreshSelected() {
			calls.push('refreshSelected');
			return structuredClone({ selected, messages, sessions: [selected] });
		},
	};
	const connection = { signal: lifetime.signal, connect: async () => { calls.push('connect'); return client; }, invalidate: () => { invalidations++; } };
	const coordinator = new SynchronizationCoordinator(connection, sessions, { retries: 3, baseDelay: 10, maxDelay: 20, timeout: 100, ...policy }, clock);
	const f = {
		coordinator, lifetime, client, sessions, connection, jobs, streams, calls, active: {}, permissions: [], forms: [],
		get snapshots() { return snapshots; }, get invalidations() { return invalidations; },
		setSelected(value) { selected = value; }, setMessages(value) { messages = value; },
		setSkills(value) { skills = value; }, setCommands(value) { commands = value; },
		failNext() { failNextPrompt = true; },
		run(delay) { const entry = [...jobs].find(([, job]) => job.delay === delay); assert.ok(entry, `Missing ${delay}ms timer`); jobs.delete(entry[0]); entry[1].callback(); },
	};
	return f;
}

test('lazy plugin-owned synchronization shares opens and subscribes before snapshot; operations are gated', async () => {
	const f = fixture();
	assert.deepEqual(f.calls, []);
	assert.throws(() => f.coordinator.assertReady(), /synchronizing/);
	const a = f.coordinator.open();
	assert.equal(a, f.coordinator.open());
	await a;
	assert.deepEqual(f.calls.slice(0, 2), ['connect', 'subscribe']);
	assert.equal(f.snapshots, 1);
	assert.equal(f.coordinator.state.phase, 'ready');
	assert.equal(f.coordinator.state.conversation.execution, 'succeeded');
	f.coordinator.assertReady();
	f.lifetime.abort();
	assert.equal(f.jobs.size, 0);
});

test('live text batches publish incremental projection changes to subscribed views', async () => {
	const f = fixture();
	await f.coordinator.open();
	const observed = [];
	f.coordinator.subscribe(() => observed.push(f.coordinator.state.conversation?.messages
		.find(m => m.id === 'streaming')?.content[0]?.text));
	f.streams[0].push(event('session.step.started', { assistantMessageID: 'streaming',
		agent: 'build', model: { providerID: 'p', id: 'm' }, started: 10 }));
	const started = event('session.text.started', { assistantMessageID: 'streaming', ordinal: 0 });
	started.durable = { aggregateID: 'one', seq: eventID, version: 1 };
	f.streams[0].push(started);
	f.streams[0].push(event('session.text.delta', { assistantMessageID: 'streaming', ordinal: 0, delta: 'first' }));
	await tick();
	f.coordinator.ingestion.drain();
	assert.equal(observed.at(-1), 'first');
	f.streams[0].push(event('session.text.delta', { assistantMessageID: 'streaming', ordinal: 0, delta: ' second' }));
	await tick();
	f.coordinator.ingestion.drain();
	assert.equal(observed.at(-1), 'first second');
	f.lifetime.abort();
});

test('known skill mentions attach IDs end-to-end and an unconfirmed retry keeps them', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.sendMessage('use $apply');
	const sent = f.calls.filter((call) => call[0] === 'prompt').at(-1)[1];
	assert.equal(sent.text, 'use $apply');
	assert.deepEqual(sent.skills, [{ id: 'skill-apply' }]);
	assert.equal(f.coordinator.state.pendingPrompt.phase, 'admitted');

	f.failNext();
	await f.coordinator.sendMessage('retry $apply');
	const failed = f.calls.filter((call) => call[0] === 'prompt').at(-1)[1];
	assert.equal(failed.text, 'retry $apply');
	assert.deepEqual(failed.skills, [{ id: 'skill-apply' }]);
	assert.equal(f.coordinator.state.pendingPrompt.phase, 'uncertain');
	await f.coordinator.pending;
	await f.coordinator.retryPrompt();
	const retried = f.calls.filter((call) => call[0] === 'prompt').at(-1)[1];
	assert.equal(retried.id, failed.id, 'Retry preserves the prompt identity');
	assert.equal(retried.text, 'retry $apply');
	assert.deepEqual(retried.skills, [{ id: 'skill-apply' }]);
	assert.equal(f.coordinator.state.pendingPrompt.phase, 'admitted');
	f.lifetime.abort();
});

test('a known leading command dispatches end-to-end while an unknown one keeps the prompt path', async () => {
	const f = fixture();
	await f.coordinator.open();
	assert.equal(await f.coordinator.sendMessage('/review src/auth.ts'), true);
	assert.deepEqual(f.calls.find((call) => call[0] === 'command')[1],
		{ sessionID: 'one', name: 'review', text: 'src/auth.ts' });
	assert.equal(f.calls.filter((call) => call[0] === 'prompt').length, 0,
		'A known command never reaches the prompt endpoint');

	assert.equal(await f.coordinator.sendMessage('/team/review src/other.ts'), true);
	assert.deepEqual(f.calls.filter((call) => call[0] === 'command').at(-1)[1],
		{ sessionID: 'one', name: 'team/review', text: 'src/other.ts' });

	assert.equal(await f.coordinator.sendMessage('/unknown stays text'), true);
	assert.equal(f.calls.filter((call) => call[0] === 'command').length, 2);
	assert.equal(f.calls.filter((call) => call[0] === 'prompt').at(-1)[1].text, '/unknown stays text');
	f.lifetime.abort();
});

test('the command catalog is not requested during open and loads once on demand', async () => {
	const f = fixture();
	await f.coordinator.open();
	assert.equal(f.calls.filter((call) => call[0] === 'commands').length, 0,
		'A ready conversation must not request commands before the first / query');
	assert.equal(f.coordinator.state.commands, undefined);
	await f.coordinator.loadCommands();
	assert.deepEqual(f.calls.filter((call) => call[0] === 'commands')[0][1], { location: { directory: root } });
	assert.deepEqual(f.coordinator.state.commands.map((command) => command.name),
		['review', 'team/review', 'broken']);
	await f.coordinator.loadCommands();
	assert.equal(f.calls.filter((call) => call[0] === 'commands').length, 1, 'The catalog is reused');
	f.lifetime.abort();
});

test('eligible-but-incompatible required selectors gate sends and decisions until explicit retry', async () => {
	const f = fixture();
	f.client.model.list = async () => { throw new OpenCodeApiCompatibilityError(); };
	await f.coordinator.open();
	assert.equal(f.coordinator.state.phase, 'exhausted');
	assert.match(f.coordinator.state.error, /Incompatible OpenCode API/);
	assert.equal(f.coordinator.canOperate, false);
	assert.throws(() => f.coordinator.assertReady());
	assert.equal(f.jobs.size, 0);
	assert.deepEqual(f.coordinator.state.permissions, []);
	assert.deepEqual(f.coordinator.state.forms, []);
	f.client.model.list = async () => ({ data: [] });
	await f.coordinator.retry();
	assert.equal(f.coordinator.canOperate, true);
	f.lifetime.abort();
});

test('incompatible pending-interaction responses cannot become an empty ready conversation', async () => {
	for (const kind of ['permissions', 'forms']) {
		const f = fixture();
		const owner = kind === 'permissions' ? f.client.permission : f.client.session.form;
		owner.list = async () => { throw new OpenCodeApiCompatibilityError(); };
		await f.coordinator.open();
		assert.equal(f.coordinator.state.phase, 'exhausted');
		assert.equal(f.coordinator.canOperate, false);
		assert.match(f.coordinator.state.error, /Sends and decisions are disabled/);
		assert.equal(f.jobs.size, 0);
		f.lifetime.abort();
	}
});

test('API incompatibility during an interaction refresh immediately disables all operations', async () => {
	const f = fixture();
	await f.coordinator.open();
	f.client.permission.list = async () => { throw new OpenCodeApiCompatibilityError(); };
	await f.coordinator.refreshInteractions();
	assert.equal(f.coordinator.state.phase, 'exhausted');
	assert.equal(f.coordinator.canOperate, false);
	assert.deepEqual(f.coordinator.state.permissions, []);
	assert.deepEqual(f.coordinator.state.forms, []);
	f.lifetime.abort();
});

test('foreign-location interaction events cannot expose controls for the selected session ID', async () => {
	const f = fixture();
	await f.coordinator.open();
	f.streams[0].push(event('permission.asked', { id: 'foreign', action: 'tool.use', resources: ['*'] }, 'C:\\Other'));
	f.streams[0].push(event('form.created', { form: { id: 'foreign-form', sessionID: 'one', title: 'Foreign', fields: [] } }, 'C:\\Other'));
	await tick();
	assert.equal(f.coordinator.canOperate, true);
	assert.deepEqual(f.coordinator.state.permissions, []);
	assert.deepEqual(f.coordinator.state.forms, []);
	f.lifetime.abort();
});

test('unsupported form fields in another session are ignored; the selected session reports them in the form', async () => {
	const f = fixture();
	await f.coordinator.open();
	f.streams[0].push(event('form.created', { form: { id: 'other-form', sessionID: 'other',
		title: 'Another client', fields: [{ key: 'future', type: 'future-field' }] } }));
	await tick();
	assert.equal(f.coordinator.canOperate, true);
	assert.deepEqual(f.coordinator.state.forms, []);
	f.streams[0].push(event('form.created', { form: { id: 'own-form', sessionID: 'one',
		title: 'This client', fields: [{ key: 'future', type: 'future-field' }] } }));
	await tick();
	assert.equal(f.coordinator.state.phase, 'ready');
	assert.equal(f.coordinator.canOperate, true);
	assert.equal(f.coordinator.state.forms.length, 1);
	assert.equal(f.coordinator.state.forms[0].fields[0].type, 'future-field');
	f.lifetime.abort();
});

test('events overlapping snapshot trigger a clean reload, never duplicate text already saved', async () => {
	const f = fixture();
	f.duringSnapshot = async (pass) => {
		if (pass !== 1) return;
		f.streams[0].push(event('session.text.delta', { assistantMessageID: 'answer', ordinal: 0, delta: 'answer' }));
		await tick();
	};
	await f.coordinator.open();
	assert.equal(f.snapshots, 2);
	assert.equal(f.coordinator.state.conversation.messages[0].content[0].text, 'answer');
	assert.equal(f.coordinator.canOperate, true);
	f.lifetime.abort();
});

test('disconnect restores missed completion and pending interactions without replaying any mutation', async () => {
	const f = fixture();
	f.active = { one: { type: 'running' }, other: { type: 'running' } };
	await f.coordinator.open();
	assert.equal(f.coordinator.state.conversation.execution, 'running');
	f.streams[0].end();
	await tick();
	assert.equal(f.coordinator.state.phase, 'retrying');
	assert.equal(f.coordinator.canOperate, false);
	f.active = {};
	f.setSelected({ id: 'one', location: { directory: root }, outcome: 'interrupted' });
	f.setMessages([{ id: 'missed', type: 'user', text: 'saved while disconnected' }]);
	f.permissions = [{ id: 'permission', sessionID: 'one' }];
	f.forms = [{ id: 'form', sessionID: 'one', fields: [] }];
	f.run(10);
	await tick();
	assert.equal(f.coordinator.state.phase, 'ready');
	assert.equal(f.coordinator.state.conversation.execution, 'interrupted');
	assert.equal(f.coordinator.state.conversation.messages[0].id, 'missed');
	assert.deepEqual(f.coordinator.state.permissions, f.permissions);
	assert.deepEqual(f.coordinator.state.forms, f.forms);
	assert.equal(f.invalidations, 1);
	f.lifetime.abort();
});

test('interaction settlement during snapshot reloads all pending state, including another client replies', async () => {
	const f = fixture();
	f.permissions = [{ id: 'stale', sessionID: 'one' }];
	f.forms = [{ id: 'stale-form', sessionID: 'one', fields: [] }];
	const original = f.client.session.form.list;
	let reads = 0;
	f.client.session.form.list = async (...args) => {
		const result = await original(...args);
		if (++reads === 1) {
			f.streams[0].push(event('form.replied', { id: 'stale-form' }));
			f.permissions = []; f.forms = [];
			await tick();
		}
		return result;
	};
	await f.coordinator.open();
	assert.equal(f.snapshots, 2);
	assert.deepEqual(f.coordinator.state.permissions, []);
	assert.deepEqual(f.coordinator.state.forms, []);
	f.lifetime.abort();
});

test('overflow and continuously overlapping snapshots are bounded, backoff is capped, exhaustion needs explicit retry', async () => {
	const f = fixture({ maxEvents: 1, snapshotPasses: 2 });
	f.duringSnapshot = async () => {
		f.streams.at(-1).push(event('session.text.delta', { assistantMessageID: 'answer', ordinal: 0, delta: 'x' }));
		f.streams.at(-1).push(event('session.text.delta', { assistantMessageID: 'answer', ordinal: 0, delta: 'x' }));
		await tick();
	};
	await f.coordinator.open();
	for (const delay of [10, 20, 20]) {
		assert.equal(f.coordinator.state.delay, delay); f.run(delay); await f.coordinator.pending;
	}
	assert.equal(f.coordinator.state.phase, 'exhausted');
	assert.equal(f.snapshots, 8);
	assert.equal(f.jobs.size, 0);
	assert.throws(() => f.coordinator.assertReady());
	f.duringSnapshot = undefined;
	await f.coordinator.retry();
	assert.equal(f.coordinator.state.phase, 'ready');
	f.lifetime.abort();
});

test('unrelated session events do not invalidate snapshot or live state; uncertain live deltas request recovery', async () => {
	const f = fixture();
	f.duringSnapshot = async () => {
		f.streams[0].push(event('session.text.delta', { sessionID: 'other' }));
		await tick();
	};
	await f.coordinator.open();
	assert.equal(f.snapshots, 1);
	f.streams[0].push(event('session.text.delta', { assistantMessageID: 'answer', ordinal: 0, delta: 'duplicate?' }));
	await tick();
	assert.equal(f.coordinator.canOperate, true); // Not reduced until its bounded batch.
	f.coordinator.ingestion.drain();
	assert.equal(f.coordinator.state.phase, 'retrying');
	assert.equal(f.coordinator.state.conversation, undefined);
	f.lifetime.abort();
});

test('unload during backoff cancels timers/subscription and never reconnects; disposal is idempotent', async () => {
	const f = fixture();
	await f.coordinator.open();
	f.streams[0].end();
	await tick();
	const scheduled = [...f.jobs.values()][0].callback;
	f.lifetime.abort();
	assert.equal(f.jobs.size, 0);
	assert.equal(f.streams[0].signal.aborted, true);
	scheduled();
	await f.coordinator.retry();
	f.coordinator.dispose();
	assert.equal(f.streams.length, 1);
	assert.equal(f.coordinator.state.phase, 'disposed');
});

test('unload during snapshot aborts requests and rejects late results without restoring interaction', async () => {
	const f = fixture();
	const wait = deferred();
	f.duringSnapshot = () => wait.promise;
	const opening = f.coordinator.open();
	await tick();
	const signal = f.calls.find((call) => call[0] === 'snapshot')[1];
	f.lifetime.abort();
	assert.equal(signal.aborted, true);
	wait.resolve();
	await opening;
	assert.equal(f.coordinator.state.phase, 'disposed');
	assert.equal(f.coordinator.canOperate, false);
	assert.equal(f.jobs.size, 0);
});

test('subscription readiness timeout has finite recovery and no snapshot is requested before connected', async () => {
	const f = fixture({ retries: 1 });
	f.client.event.subscribe = ({ signal }) => ({ async *[Symbol.asyncIterator]() {
		await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
		if (!signal.aborted) yield event('server.connected');
	} });
	const opening = f.coordinator.open();
	await tick();
	assert.equal(f.snapshots, 0);
	f.run(100);
	await opening;
	assert.equal(f.coordinator.state.phase, 'retrying');
	f.run(10);
	await tick();
	f.run(100);
	await tick();
	assert.equal(f.coordinator.state.phase, 'exhausted');
	assert.equal(f.jobs.size, 0);
	f.lifetime.abort();
});

test('buffer ignores foreign vault traffic even for the same session ID and bounds oversized relevant payloads', async () => {
	for (const foreign of [true, false]) {
		const f = fixture({ maxCharacters: 100, snapshotPasses: 2 });
		f.duringSnapshot = async (pass) => {
			if (pass !== 1) return;
			f.streams[0].push(event('session.text.delta', { assistantMessageID: 'answer', ordinal: 0,
				delta: 'x'.repeat(1000) }, foreign ? 'C:\\Other' : root));
			await tick();
		};
		await f.coordinator.open();
		assert.equal(f.snapshots, foreign ? 1 : 2);
		assert.equal(f.coordinator.state.phase, 'ready');
		f.lifetime.abort();
	}
});

test('a new connected marker requires resynchronization rather than assuming replay', async () => {
	const f = fixture();
	await f.coordinator.open();
	f.streams[0].push(event('server.connected'));
	await tick();
	assert.equal(f.coordinator.state.phase, 'retrying');
	assert.equal(f.coordinator.canOperate, false);
	f.lifetime.abort();
});

test('pinned 2.2.2 client subscribes and reads exact active/permission/form routes and response envelopes', async () => {
	const f = fixture();
	const requests = [];
	const client = OpenCode.make({ baseUrl: 'http://127.0.0.1:4096', fetch: async (input, init) => {
		const request = new Request(input, init);
		const path = new URL(request.url).pathname;
		requests.push([request.method, path]);
		assert.equal(request.method, 'GET', 'Recovery must never perform a mutation');
		if (path === '/api/event') return new Response(new ReadableStream({ start(output) {
			output.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event('server.connected'))}\n\n`));
		} }), { headers: { 'content-type': 'text/event-stream' } });
		if (path === '/api/session/active') return Response.json({ data: { one: { type: 'running' } } });
		if (path === '/api/agent' || path === '/api/model') return Response.json({ location: { directory: root }, data: [] });
		if (path === '/api/session/one/permission') return Response.json({ data: [{ id: 'permission', sessionID: 'one' }] });
		if (path === '/api/session/one/form') return Response.json({ data: [{ id: 'form', sessionID: 'one', fields: [] }] });
		assert.fail(`Unexpected route ${path}`);
	} });
	f.connection.connect = async () => client;
	await f.coordinator.open();
	assert.equal(requests[0][1], '/api/event');
	assert.equal(requests.length, 6);
	assert.equal(f.coordinator.state.conversation.execution, 'running');
	assert.equal(f.coordinator.state.permissions[0].id, 'permission');
	assert.equal(f.coordinator.state.forms[0].id, 'form');
	f.lifetime.abort();
});
