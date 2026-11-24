import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { OpenCode } from '@opencode/client';

const bundle = await build({
	stdin: { contents: `export * from './src/opencode/api-contract';
		export * from './src/opencode/discovery';`, resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	createRequire(import.meta.url), module, module.exports,
);
const {
	withApiValidation, validateActiveSessions, validateAgentList, validateCommandList, validateEvent,
	validateFormInfo, validateFormList, validateMessagePage, validateModelList, validatePermissionList,
	validateSessionInfo, validateSessionPage, validateSkillList, discoverConnection,
	OpenCodeApiCompatibilityError,
} = module.exports;

const root = 'C:\\Vault';
const isApiError = (error) => error instanceof OpenCodeApiCompatibilityError
	&& error.name === 'OpenCodeApiCompatibilityError'
	&& /Incompatible OpenCode API/.test(error.message)
	&& /Sends and decisions are disabled/.test(error.message);
const rejectsApi = (promise, secret) => assert.rejects(promise, (error) => {
	assert.ok(isApiError(error));
	if (secret) assert.ok(!error.message.includes(secret) && !error.stack.includes(secret));
	return true;
});

const session = (id, directory = root, extra = {}) => ({
	id, projectID: 'project', cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
	time: { created: 1, updated: 1 }, location: { directory }, ...extra,
});
const page = (data, next = null) => ({ data, cursor: { next, previous: null } });
const user = (id, text) => ({ id, type: 'user', time: { created: 1 }, text });
const assistant = (id, content, extra = {}) => ({
	id, type: 'assistant', agent: 'build', model: { id: 'model', providerID: 'provider' },
	time: { created: 1, completed: 2 }, content, ...extra,
});
const permission = (sessionID, id = 'permission') => ({
	id, sessionID, action: 'Read file', resources: ['C:\\Vault\\note.md'], save: ['C:\\Vault'],
});
const field = (key, type, extra = {}) => ({ key, type, title: key, ...extra });
const form = (sessionID, id = 'form', fields = [field('answer', 'string', { required: true })]) => ({
	id, sessionID, title: 'Question', fields,
});
const event = (type, data = {}, extra = {}) => ({
	id: `event-${type}`, created: 10, type, location: { directory: root }, data: { sessionID: 'one', ...data }, ...extra,
	...((type === 'session.step.first-token' && !extra.durable)
		? { durable: { aggregateID: 'one', seq: 1, version: 1 } } : {}),
});

async function server(t, handler) {
	const instance = createServer(handler);
	await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
	t.after(() => { instance.closeAllConnections(); instance.close(); });
	return `http://127.0.0.1:${instance.address().port}`;
}
const json = (res, body, status = 200) => {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
};

test('generated session, message, agent, model, active, permission and form responses validate', async (t) => {
	const origin = await server(t, (req, res) => {
		const url = new URL(req.url, 'http://localhost');
		if (url.pathname === '/api/session/one') return json(res, { data: session('one') });
		if (url.pathname === '/api/session/one/message') return json(res, page([user('m1', 'hello'), assistant('m2', [{ type: 'text', text: 'world' }])]));
		if (url.pathname === '/api/session/one/permission') return json(res, { data: [permission('one')] });
		if (url.pathname === '/api/session/one/form') return json(res, { data: [form('one')] });
		if (url.pathname === '/api/session/active') return json(res, { data: { one: { type: 'running' } } });
		if (url.pathname === '/api/session' && req.method === 'POST') return json(res, { data: session('created') });
		if (url.pathname === '/api/session') return json(res, page([session('one'), session('two')]));
		if (url.pathname === '/api/agent') return json(res, { location: { directory: root }, data: [{
			id: 'build', name: 'Build', mode: 'primary', hidden: false, permissions: [], request: {},
		}] });
		if (url.pathname === '/api/model') return json(res, { location: { directory: root }, data: [{
			id: 'model', modelID: 'model', providerID: 'provider', name: 'Model', enabled: true,
			capabilities: { tools: true, input: [], output: [] }, variants: [], cost: [],
			time: { released: 1 }, status: 'active', limit: { context: 1, output: 1 },
		}] });
		if (url.pathname === '/api/skill') return json(res, { location: { directory: root }, data: [{
			id: 'skill', name: 'apply', description: 'Apply a change',
			path: 'C:\\Vault\\skills\\apply.md', content: '# apply',
		}] });
		if (url.pathname === '/api/command') return json(res, { location: { directory: root }, data: [
			{ name: 'review', description: 'Review the working tree' },
			{ name: 'team/review' },
		] });
		json(res, { _tag: 'NotFoundError', message: 'unknown endpoint' }, 404);
	});
	const client = withApiValidation(OpenCode.make({ baseUrl: origin }));
	const sessions = await client.session.list({ directory: root });
	assert.deepEqual(sessions.data.map((entry) => entry.id), ['one', 'two']);
	assert.equal(sessions.cursor.next, null);
	assert.equal((await client.session.get({ sessionID: 'one' })).id, 'one');
	assert.equal((await client.session.create({ location: { directory: root } })).id, 'created');
	assert.deepEqual((await client.message.list({ sessionID: 'one' })).data.map((entry) => entry.id), ['m1', 'm2']);
	assert.deepEqual((await client.agent.list({ location: { directory: root } })).data.map((entry) => entry.id), ['build']);
	assert.deepEqual((await client.model.list({ location: { directory: root } })).data.map((entry) => entry.id), ['model']);
	assert.deepEqual((await client.skill.list({ location: { directory: root } })).data.map((entry) => entry.name), ['apply']);
	assert.deepEqual((await client.command.list({ location: { directory: root } })).data.map((entry) => entry.name),
		['review', 'team/review']);
	assert.deepEqual(await client.session.active(), { one: { type: 'running' } });
	assert.deepEqual((await client.permission.list({ sessionID: 'one' })).map((entry) => entry.id), ['permission']);
	assert.deepEqual((await client.session.form.list({ sessionID: 'one' })).map((entry) => entry.id), ['form']);
});

test('unsupported endpoints and malformed required responses fail as API incompatibility', async (t) => {
	const unsupported = await server(t, (_req, res) => json(res, { message: 'private upstream detail' }, 404));
	await rejectsApi(withApiValidation(OpenCode.make({ baseUrl: unsupported })).session.list({ directory: root }),
		'private upstream detail');

	const malformed = await server(t, (_req, res) => json(res, { data: [{ id: '', location: {} }], cursor: {} }));
	await rejectsApi(withApiValidation(OpenCode.make({ baseUrl: malformed })).session.list({ directory: root }));

	const wrongSession = await server(t, (_req, res) => json(res, { data: session('other') }));
	await rejectsApi(withApiValidation(OpenCode.make({ baseUrl: wrongSession })).session.get({ sessionID: 'one' }));
});

test('authentication, transport, cancellation, and missing-session errors are preserved', async (t) => {
	const denied = await server(t, (_req, res) => json(res, { message: 'denied' }, 401));
	await assert.rejects(withApiValidation(OpenCode.make({ baseUrl: denied })).session.list({ directory: root }),
		(error) => !isApiError(error) && error.message === 'denied');

	const failed = new Error('offline');
	await assert.rejects(withApiValidation(OpenCode.make({
		baseUrl: 'http://127.0.0.1:1', fetch: async () => { throw failed; },
	})).session.list({ directory: root }), (error) => !isApiError(error)
		&& error.name === 'ClientError' && error.reason === 'Transport' && error.cause === failed);

	const missing = { _tag: 'SessionNotFoundError', sessionID: 'one', message: 'missing' };
	await assert.rejects(withApiValidation(OpenCode.make({
		baseUrl: 'http://127.0.0.1:1',
		fetch: async () => new Response(JSON.stringify(missing), { status: 404, headers: { 'content-type': 'application/json' } }),
	})).session.get({ sessionID: 'one' }), (error) => error._tag === 'SessionNotFoundError');
});

test('session.update is wrapped so unsupported statuses translate to API incompatibility', async (t) => {
	const requests = [];
	const origin = await server(t, (req, res) => {
		const url = new URL(req.url, 'http://localhost');
		requests.push([req.method, url.pathname]);
		if (url.pathname === '/api/session/one') return res.writeHead(204).end();
		json(res, { message: 'unknown endpoint' }, 404);
	});
	await withApiValidation(OpenCode.make({ baseUrl: origin }))
		.session.update({ sessionID: 'one', title: 'Renamed' });
	assert.ok(requests.some(([method, path]) => method !== 'GET' && path === '/api/session/one'),
		'Rename reaches the session update route');

	const unsupported = await server(t, (_req, res) => json(res, { message: 'private upstream detail' }, 405));
	await rejectsApi(withApiValidation(OpenCode.make({ baseUrl: unsupported }))
		.session.update({ sessionID: 'one', title: 'Renamed' }), 'private upstream detail');

	const missing = await server(t, (_req, res) => json(res, { _tag: 'SessionNotFoundError', sessionID: 'one' }, 404));
	await assert.rejects(withApiValidation(OpenCode.make({ baseUrl: missing }))
		.session.update({ sessionID: 'one', title: 'Renamed' }),
	(error) => error._tag === 'SessionNotFoundError');
});

test('discovery returns the validated client for later required requests', async (t) => {
	let listBody = page([session('one')]);
	const origin = await server(t, (req, res) => {
		if (new URL(req.url, origin).pathname === '/api/info') {
			return json(res, { version: '2.3.2', pid: 42, urls: [], paths: { tmp: 'C:\\Temp' } });
		}
		json(res, listBody);
	});
	const registration = JSON.stringify({ url: origin, pid: 42, version: '2.3.2', password: 'private-secret' });
	const client = await discoverConnection(async () => registration);
	assert.deepEqual((await client.session.list({ directory: root })).data.map((entry) => entry.id), ['one']);
	listBody = { data: null, cursor: {} };
	await rejectsApi(client.session.list({ directory: root }));
});

test('pending permissions and forms must belong to the requested session', () => {
	assert.deepEqual(validatePermissionList([permission('one')], 'one').map((entry) => entry.id), ['permission']);
	assert.deepEqual(validateFormList([form('one')], 'one').map((entry) => entry.id), ['form']);
	for (const run of [
		() => validatePermissionList([permission('other')], 'one'),
		() => validateFormList([form('other')], 'one'),
	]) assert.throws(run, isApiError);
});

test('supported form fields validate and unknown field types reach form-level handling', () => {
	const supported = form('one', 'form', [
		field('choice', 'string', { options: [{ value: 'a', label: 'A' }], custom: true,
			when: [{ key: 'enabled', op: 'eq', value: true }] }),
		field('email', 'string', { format: 'email' }),
		field('number', 'number', { minimum: 0, maximum: 'Infinity' }),
		field('integer', 'integer', { minimum: '-Infinity', default: 1 }),
		field('enabled', 'boolean', { default: false }),
		field('many', 'multiselect', { options: [{ value: 'x', label: 'X' }], minItems: 1, default: ['x'] }),
		field('link', 'external', { url: 'https://example.com', title: 'Docs' }),
	]);
	assert.equal(validateFormInfo(supported).id, 'form');
	const future = form('one', 'form', [field('future', 'rating')]);
	assert.equal(validateFormInfo(future).fields[0].type, 'rating');
	for (const broken of [
		form('one', 'form', [field('future-format', 'string', { format: 'hostname' })]),
		form('one', 'form', [field('choice', 'string', { when: [{ key: 'x', op: 'gt', value: 1 }] })]),
		form('one', 'form', [field('duplicate', 'string'), field('duplicate', 'boolean')]),
		form('one', 'form', [field('many', 'multiselect', { options: 'x' })]),
	]) assert.throws(() => validateFormInfo(broken), isApiError);
});

test('message, agent, model and active shapes reject malformed fields used by production', () => {
	assert.equal(validateMessagePage(page([
		user('u', 'hello'),
		assistant('a', [
			{ type: 'text', text: 'answer' },
			{ type: 'reasoning', text: 'why' },
			{ type: 'tool', id: 't', name: 'read', state: { status: 'completed', input: {},
				content: [{ type: 'text', text: 'ok' }] }, time: { created: 1 } },
		]),
		{ id: 'c', type: 'compaction', time: { created: 1 }, status: 'failed', reason: 'auto',
			error: { type: 'Error', message: 'failed' } },
		{ id: 's', type: 'shell', time: { created: 1 }, command: 'dir', status: 'exited', output: { output: 'ok', cursor: 0, size: 2, truncated: false } },
		{ id: 'i', type: 'idle', time: { created: 1 }, outcome: 'succeeded' },
		{ id: 'future', type: 'future-notice', time: { created: 1 } },
	])).data.length, 6);
	for (const broken of [
		page([assistant('a', [{ type: 'image', uri: 'https://example.com/a.png' }])]),
		page([assistant('a', [{ type: 'tool', id: 't', name: 'read', state: { status: 'running', input: {} }, time: { created: 1 } }])]),
		page([{ id: 'c', type: 'compaction', status: 'future-status' }]),
	]) assert.throws(() => validateMessagePage(broken), isApiError);

	assert.equal(validateAgentList({ location: { directory: root }, data: [{
		id: 'build', name: 'Build', mode: 'all', hidden: true,
	}] }).data[0].id, 'build');
	assert.throws(() => validateAgentList({ location: { directory: root }, data: [{ id: 'x', name: 'X', mode: 'primary' }] }), isApiError);

	assert.equal(validateModelList({ location: { directory: root }, data: [{
		id: 'm', modelID: 'm', providerID: 'p', name: 'M', enabled: true,
	}] }).data[0].id, 'm');
	assert.throws(() => validateModelList({ location: { directory: root }, data: [{ id: 'm', modelID: 'm', providerID: 'p', name: 'M' }] }), isApiError);

	const skill = (extra = {}) => ({ id: 'skill', name: 'apply', path: 'C:\\Vault\\skills\\apply.md',
		content: '# apply', ...extra });
	assert.equal(validateSkillList({ location: { directory: root }, data: [
		skill({ description: 'Apply a change' }),
	] }).data[0].name, 'apply');
	const extraFields = skill({ autoinvoke: true, future: { scope: 'project' } });
	assert.deepEqual(validateSkillList({ location: { directory: root }, data: [extraFields] }).data[0].future,
		{ scope: 'project' }, 'Unknown skill fields are preserved');
	for (const broken of [
		{ location: { directory: root }, data: [skill({ id: '' })] },
		{ location: { directory: root }, data: [skill({ name: undefined })] },
		{ location: { directory: root }, data: [skill({ path: 1 })] },
		{ location: { directory: root }, data: [skill({ content: null })] },
		{ location: { directory: root }, data: [skill({ description: 1 })] },
		{ location: { directory: root }, data: [skill({ autoinvoke: 'yes' })] },
		{ location: {}, data: [] },
	]) assert.throws(() => validateSkillList(broken), isApiError);

	const command = (extra = {}) => ({ name: 'review', ...extra });
	assert.equal(validateCommandList({ location: { directory: root }, data: [
		command({ description: 'Review the working tree' }),
	] }).data[0].name, 'review');
	const extraCommand = command({ future: { scope: 'project' } });
	assert.deepEqual(validateCommandList({ location: { directory: root }, data: [extraCommand] }).data[0].future,
		{ scope: 'project' }, 'Unknown command fields are preserved');
	for (const broken of [
		{ location: { directory: root }, data: [command({ name: '' })] },
		{ location: { directory: root }, data: [command({ name: undefined })] },
		{ location: { directory: root }, data: [command({ description: 1 })] },
		{ location: { directory: root }, data: null },
		{ location: {}, data: [] },
	]) assert.throws(() => validateCommandList(broken), isApiError);

	assert.equal(validateActiveSessions({ one: { type: 'running' }, two: { type: 'future-state' } }).one.type, 'running');
	for (const broken of [{ one: null }, { one: { type: 1 } }, { '': { type: 'running' } }]) {
		assert.throws(() => validateActiveSessions(broken), isApiError);
	}
	assert.equal(validateSessionPage(page([session('one')])).data[0].id, 'one');
	assert.throws(() => validateSessionInfo({ id: 'one', location: {} }), isApiError);
});

test('event envelopes admit unknown future types and reject malformed used fields', () => {
	const future = { id: 'future', created: 1, type: 'session.future.event', data: { sessionID: 'one', extra: true } };
	assert.equal(validateEvent(future), future);
	assert.equal(validateEvent(event('session.step.first-token', { assistantMessageID: 'm' })).type,
		'session.step.first-token');
	assert.equal(validateEvent(event('session.text.delta', { assistantMessageID: 'm', ordinal: 0, delta: 'x' })).type,
		'session.text.delta');
	assert.equal(validateEvent(event('permission.asked', { id: 'p', action: 'Read', resources: ['file'] })).type,
		'permission.asked');
	assert.equal(validateEvent(event('form.created', { form: form('one') })).type, 'form.created');
	assert.equal(validateEvent(event('server.connected', undefined, { data: {} })).type, 'server.connected');
	assert.equal(validateEvent(event('session.execution.started', {}, {
		durable: { aggregateID: 'session:one', seq: 1, version: 1 },
	})).type, 'session.execution.started');
	// Unknown types retain their envelope for recovery, without interpreting
	// their payload as a known event contract.
	assert.equal(validateEvent({ ...future, durable: { aggregateID: 'one', seq: 1, version: 2 } }).type, future.type);

	for (const broken of [
		{ created: 1, type: 'session.text.delta', data: {} },
		{ id: 'e', created: 1, type: 'session.text.delta', data: { sessionID: 'one', assistantMessageID: 'm' } },
		{ id: 'e', created: 'now', type: 'session.future.event', data: {} },
		{ id: 'e', created: 1, type: 'session.future.event', location: { directory: 1 }, data: {} },
		{ id: 'e', created: 1, type: 'session.future.event', durable: { aggregateID: 'a', seq: '1' }, data: {} },
		{ id: 'e', created: 1, type: 'session.execution.started', durable: { aggregateID: 'a', seq: 1 }, data: { sessionID: 'one' } },
		{ id: 'e', created: 1, type: 'session.execution.started', durable: { aggregateID: 'a', seq: 1, version: 2 }, data: { sessionID: 'one' } },
		{ id: 'e', created: 1, type: 'session.execution.started', durable: { aggregateID: 'a', seq: 1, version: '1' }, data: { sessionID: 'one' } },
		{ id: 'e', created: 1, type: 'session.step.first-token', data: { sessionID: 'one' } },
		{ id: 'e', created: 1, type: 'permission.asked', data: { id: 'p', sessionID: 'one', action: 'Read', resources: 'file' } },
	]) assert.throws(() => validateEvent(broken), isApiError);
	const futureForm = { id: 'e', created: 1, type: 'form.created', data: { form: form('one', 'f', [field('future', 'rating')]) } };
	assert.equal(validateEvent(futureForm), futureForm);
});

test('reviewed tool success/failure use schema version 2, not a global version-1 rule', () => {
	const success = event('session.tool.success', { assistantMessageID: 'm', id: 'read',
		executed: true, content: [{ type: 'text', text: 'synthetic' }], metadata: { truncated: false } },
	{ durable: { aggregateID: 'one', seq: 1, version: 2 } });
	const failure = { ...success, type: 'session.tool.failed',
		data: { ...success.data, error: { type: 'unknown', message: 'synthetic failure' } } };
	assert.equal(validateEvent(success), success);
	assert.equal(validateEvent(failure), failure);
	for (const bad of [
		{ ...success, durable: { ...success.durable, version: 1 } },
		{ ...success, durable: { ...success.durable, version: 3 } },
		{ ...failure, durable: undefined },
		{ ...success, data: { ...success.data, executed: undefined } },
		{ ...success, data: { ...success.data, content: [] } },
		event('permission.asked', { id: 'p', action: 'read', resources: [] },
			{ durable: { aggregateID: 'one', seq: 1, version: 1 } }),
	]) assert.throws(() => validateEvent(bad), isApiError);
	for (const type of ['session.deleted', 'session.forked', 'session.instructions.updated']) {
		assert.equal(validateEvent({ ...success, type }).type, type);
		assert.throws(() => validateEvent({ ...success, type, durable: { ...success.durable, version: 1 } }), isApiError);
	}
});

test('the pinned generated event subscription forwards a 2.3.2 first-token event', async (t) => {
	const firstToken = {
		id: 'first-token', created: 20, type: 'session.step.first-token',
		durable: { aggregateID: 'session:one', seq: 1, version: 1 },
		location: { directory: root },
		data: { sessionID: 'one', assistantMessageID: 'm1' },
	};
	const origin = await server(t, (_req, res) => {
		res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
		res.write(`data: ${JSON.stringify({ id: 'connected', type: 'server.connected', data: {} })}\n\n`);
		res.write(`data: ${JSON.stringify(firstToken)}\n\n`);
		res.end();
	});
	const client = withApiValidation(OpenCode.make({ baseUrl: origin }));
	const received = [];
	for await (const value of client.event.subscribe()) {
		received.push(value);
		if (received.length === 2) break;
	}
	assert.equal(received[0].type, 'server.connected');
	assert.deepEqual(received[1], firstToken);
});
