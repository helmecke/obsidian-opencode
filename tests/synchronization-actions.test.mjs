import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/state/synchronization.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'], {})(createRequire(import.meta.url), module, module.exports);
const { SynchronizationCoordinator } = module.exports;
const root = 'C:\\Vault';
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let eventID = 0;
const event = (type, data = {}) => ({ id: `event-${++eventID}`, created: eventID, type,
	...(/^session\.(inbox|execution|step)\.|^session\.(agent|model)\.selected$/.test(type)
		? { durable: { aggregateID: 'one', seq: eventID, version: 1 } } : {}),
	location: { directory: root }, data: { sessionID: 'one', ...data } });

function fixture() {
	const lifetime = new AbortController();
	const calls = [];
	let session = { id: 'one', location: { directory: root }, agent: 'plan', model: { providerID: 'p', id: 'm1' }, outcome: 'succeeded' };
	let messages = [{ id: 'saved', type: 'assistant', content: [{ type: 'text', text: 'saved' }], time: { created: 1, completed: 2 } }];
	let permissions = [];
	let forms = [];
	let promptID = 0;
	const streams = [];
	const client = {
		event: { subscribe: ({ signal }) => {
			calls.push('subscribe');
			const queue = [{ id: 'connected', created: 1, type: 'server.connected', data: {} }];
			let wake;
			let done = false;
			signal.addEventListener('abort', () => { done = true; wake?.(); }, { once: true });
			const stream = { push(event) { queue.push(event); wake?.(); } };
			streams.push(stream);
			return { async *[Symbol.asyncIterator]() {
				while (!done) {
					if (queue.length) yield queue.shift();
					else await new Promise((resolve) => { wake = resolve; });
				}
			} };
		} },
		agent: { list: async (input) => { calls.push(['agents', input]); return { data: [
			{ id: 'plan', name: 'Plan', mode: 'primary', hidden: false },
			{ id: 'build', name: 'Build', mode: 'primary', hidden: false },
			{ id: 'secret', name: 'Secret', mode: 'primary', hidden: true },
			{ id: 'child', name: 'Child', mode: 'subagent', hidden: false },
		] }; } },
		model: { list: async (input) => { calls.push(['models', input]); return { data: [
			{ id: 'm', modelID: 'm1', providerID: 'p', name: 'Model One', enabled: true },
			{ id: 'm', modelID: 'm2', providerID: 'p', name: 'Model Two', enabled: true },
			{ id: 'm', modelID: 'off', providerID: 'p', name: 'Disabled', enabled: false },
		] }; } },
		permission: {
			list: async () => permissions,
			reply: async (input) => {
				calls.push(['permission.reply', input]);
				if (input.requestID === 'settled') throw new Error('already settled');
				permissions = permissions.filter((request) => request.id !== input.requestID);
			},
		},
		message: { list: async () => ({ data: messages, cursor: {} }) },
		session: {
			active: async () => ({}),
			list: async () => ({ data: [session], cursor: {} }),
			get: async () => session,
			create: async () => session,
			form: {
				list: async () => forms,
				reply: async (input) => {
					calls.push(['form.reply', input]);
					if (input.formID === 'settled-form' || input.formID === 'still') throw new Error('already settled');
					forms = forms.filter((form) => form.id !== input.formID);
				},
				cancel: async (input) => {
					calls.push(['form.cancel', input]);
					forms = forms.filter((form) => form.id !== input.formID);
				},
			},
			prompt: async (input) => {
				calls.push(['prompt', input]);
				if (input.text === 'lost') {
					messages.push({ id: input.id, type: 'user', text: input.text, time: { created: 2 } });
					throw new Error('lost ack');
				}
				return { id: input.id, sessionID: session.id, type: 'user', payload: { text: input.text }, delivery: 'queue' };
			},
			interrupt: async (input) => { calls.push(['interrupt', input]); return { interrupted: true }; },
			switchAgent: async (input) => {
				calls.push(['switchAgent', input]);
				if (input.agent === 'broken') throw new Error('rejected');
				session = { ...session, agent: input.agent };
			},
			switchModel: async (input) => {
				calls.push(['switchModel', input]);
				session = { ...session, model: input.model };
			},
		},
	};
	const sessions = {
		vaultRoot: root,
		selectedID: 'one',
		state: { sessions: [session], selected: session, messages },
		async open() { return { selected: session, sessions: [session], messages: structuredClone(messages) }; },
		async refreshSelected() {
			calls.push('refreshSelected');
			return { ...this.state, selected: session, sessions: [session] };
		},
	};
	const connection = { signal: lifetime.signal, connect: async () => client, invalidate: () => calls.push('invalidate') };
	const coordinator = new SynchronizationCoordinator(connection, sessions, { retries: 1, baseDelay: 10, maxDelay: 10, timeout: 1000 },
		{ set: () => ({}), clear: () => {} }, () => `prompt-${++promptID}`);
	return {
		coordinator, connection, client, calls, lifetime, sessions, streams,
		get session() { return session; },
		setPermissions(value) { permissions = value; },
		setForms(value) { forms = value; },
		setMessages(value) { messages = value; },
		push(event) { streams.at(-1).push(event); },
	};
}

test('loadOptions publishes only usable, location-scoped agents and models', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.loadOptions();
	assert.deepEqual(f.coordinator.state.agents.map((agent) => agent.id), ['plan', 'build']);
	assert.deepEqual(f.coordinator.state.models.map((model) => model.modelID), ['m1', 'm2']);
	assert.deepEqual(f.calls.filter((call) => call[0] === 'agents')[0][1], { location: { directory: root } });
	assert.deepEqual(f.calls.filter((call) => call[0] === 'models')[0][1], { location: { directory: root } });
	f.lifetime.abort();
});

test('agent and model changes are server-confirmed; failures preserve the confirmed selection', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.setAgent('build');
	assert.equal(f.coordinator.state.snapshot.selected.agent, 'build');
	await f.coordinator.setModel({ providerID: 'p', id: 'm2' });
	assert.deepEqual(f.coordinator.state.snapshot.selected.model, { providerID: 'p', id: 'm2' });
	await f.coordinator.setAgent('broken');
	await tick();
	assert.equal(f.coordinator.state.snapshot.selected.agent, 'build');
	assert.match(f.coordinator.state.actionError, /Unable to change the agent/);
	f.lifetime.abort();
});

test('explicit stop interrupts only when asked and reports the refreshed state', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.stop();
	assert.deepEqual(f.calls.find((call) => call[0] === 'interrupt')[1], { sessionID: 'one' });
	assert.equal(f.coordinator.state.actionError, undefined);
	f.lifetime.abort();
});

test('stable prompt identity is shown and uncertain admission is reconciled without a new ID', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.sendMessage('hello');
	assert.equal(f.calls.find((call) => call[0] === 'prompt')[1].id, 'prompt-1');
	assert.equal(f.coordinator.state.pendingPrompt.phase, 'admitted');
	await f.coordinator.sendMessage('lost');
	await tick();
	const prompts = f.calls.filter((call) => call[0] === 'prompt');
	assert.deepEqual(prompts.map((call) => call[1].id), ['prompt-1', 'prompt-2']);
	assert.equal(f.coordinator.state.pendingPrompt, undefined, 'Snapshot reconciliation settles the admitted prompt');
	assert.equal(prompts.length, 2, 'Uncertain admission must not be automatically replayed');
	f.lifetime.abort();
});

test('permission replies send once/always/reject and refresh stale controls without automatic grants', async () => {
	const f = fixture();
	f.setPermissions([{ id: 'allow', sessionID: 'one', action: 'Run', resources: ['a'] },
		{ id: 'settled', sessionID: 'one', action: 'Read', resources: ['b'] }]);
	await f.coordinator.open();
	await f.coordinator.replyPermission('allow', 'always');
	assert.deepEqual(f.calls.find((call) => call[0] === 'permission.reply')[1],
		{ sessionID: 'one', requestID: 'allow', decision: 'always' });
	assert.deepEqual(f.coordinator.state.permissions.map((request) => request.id), ['settled']);
	await f.coordinator.replyPermission('settled', 'once');
	assert.match(f.coordinator.state.actionError, /Unable to submit the permission decision/);
	assert.deepEqual(f.coordinator.state.permissions.map((request) => request.id), ['settled'], 'A failed reply must refresh, not grant');
	assert.equal(f.coordinator.state.interactionBusy, undefined);
	f.lifetime.abort();
});

test('live permission and form events update controls without consuming connection retries', async () => {
	const f = fixture();
	await f.coordinator.open();
	f.push(event('permission.asked', { id: 'p1', action: 'Run', resources: ['a'] }));
	await tick();
	assert.deepEqual(f.coordinator.state.permissions.map((request) => request.id), ['p1']);
	assert.equal(f.coordinator.state.phase, 'ready');
	f.push(event('permission.replied', { requestID: 'p1' }));
	f.push(event('form.created', { form: { id: 'f1', sessionID: 'one', title: 'Question', fields: [] } }));
	await tick();
	assert.deepEqual(f.coordinator.state.permissions, []);
	assert.deepEqual(f.coordinator.state.forms.map((form) => form.id), ['f1']);
	f.push({ ...event('form.replied', { id: 'f1', answer: {} }), data: { id: 'f1', sessionID: 'one', answer: {} } });
	await tick();
	assert.deepEqual(f.coordinator.state.forms, []);
	assert.equal(f.coordinator.state.phase, 'ready');
	assert.equal(f.coordinator.state.attempt, 0, 'Normal interaction traffic must not exhaust recovery retries');
	f.lifetime.abort();
});

test('prompt admission triggers an authoritative message reload without a failure count', async () => {
	const f = fixture();
	await f.coordinator.open();
	await f.coordinator.sendMessage('hello');
	assert.equal(f.coordinator.state.pendingPrompt.phase, 'admitted');
	f.setMessages([...f.coordinator.state.conversation.messages,
		{ id: 'prompt-1', type: 'user', text: 'hello', time: { created: 3 } }]);
	f.push({ ...event('session.inbox.delivered', { inboxID: 'prompt-1' }),
		data: { sessionID: 'one', inboxID: 'prompt-1' } });
	await tick();
	assert.equal(f.coordinator.state.phase, 'ready');
	assert.equal(f.coordinator.state.pendingPrompt, undefined);
	assert.equal(f.coordinator.state.attempt, 0);
	assert.ok(f.coordinator.state.conversation.messages.some((message) => message.id === 'prompt-1'));
	f.lifetime.abort();
});

test('form reply and cancel are sent once; failures refresh and remain recoverable', async () => {
	const f = fixture();
	f.setForms([{ id: 'form', sessionID: 'one', fields: [] }, { id: 'settled-form', sessionID: 'one', fields: [] }]);
	await f.coordinator.open();
	await f.coordinator.replyForm('form', { answer: 'yes' });
	assert.deepEqual(f.calls.find((call) => call[0] === 'form.reply')[1],
		{ sessionID: 'one', formID: 'form', answer: { answer: 'yes' } });
	assert.deepEqual(f.coordinator.state.forms.map((form) => form.id), ['settled-form']);
	await f.coordinator.cancelForm('settled-form');
	assert.deepEqual(f.calls.find((call) => call[0] === 'form.cancel')[1], { sessionID: 'one', formID: 'settled-form' });
	f.setForms([{ id: 'still', sessionID: 'one', fields: [] }]);
	await f.coordinator.replyForm('still', { answer: 'no' });
	assert.equal(f.coordinator.state.interactionBusy, undefined);
	assert.match(f.coordinator.state.actionError, /Unable to submit the form answer/);
	f.lifetime.abort();
});
