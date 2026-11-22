import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, createObsidian, installDom } from './dom-helper.mjs';

installDom();

const bundle = await build({
	entryPoints: ['src/main.ts'], bundle: true, format: 'cjs',
	target: 'es2021', platform: 'node', external: ['obsidian'], write: false, metafile: true,
});
const require = createRequire(import.meta.url);
const liveEvents = { subscribe: ({ signal }) => ({ async *[Symbol.asyncIterator]() {
	yield { type: 'server.connected' };
	if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
} }) };
const emptyClient = () => ({
	event: liveEvents,
	agent: { list: async () => ({ data: [] }) },
	model: { list: async () => ({ data: [] }) },
	permission: { list: async () => [] },
	session: {
		list: async () => ({ data: [], cursor: {} }),
		active: async () => ({}),
		form: { list: async () => [] },
	},
});

const app = {
	workspace: {
		getLinkpathDest: () => null,
		openLinkText: async () => {},
		getLeavesOfType: () => [],
		getLeaf: () => ({ setViewState: async () => {} }),
		revealLeaf: async () => {},
	},
	metadataCache: { getFirstLinkpathDest: () => null },
	vault: { adapter: { getBasePath: () => 'C:\\Vault' } },
};

async function createShell(data = {}) {
	const registrations = { views: new Map(), commands: [], ribbons: [] };
	const leaves = [];
	const revealed = [];
	const notices = [];
	const saved = [];
	const workspace = {
		getLeavesOfType: (type) => leaves.filter((leaf) => leaf.type === type),
		getLeaf: (location) => {
			assert.equal(location, 'tab');
			const leaf = {
				async setViewState(state) {
					this.type = state.type;
					this.state = state;
				},
			};
			leaves.push(leaf);
			return leaf;
		},
		revealLeaf: async (leaf) => { revealed.push(leaf); },
	};
	const obsidian = createObsidian(app, notices);
	const obsidianWithApp = {
		...obsidian,
		Plugin: class extends obsidian.Component {
			app = { workspace, vault: { adapter: { getBasePath: () => 'C:\\Vault' } } };
			async loadData() { return data; }
			async saveData(value) { saved.push(value); }
			addSettingTab() {}
			registerView(type, factory) { registrations.views.set(type, factory); }
			addCommand(command) { registrations.commands.push(command); }
			addRibbonIcon(icon, title, callback) { registrations.ribbons.push({ icon, title, callback }); }
		},
	};
	const module = { exports: {} };
	compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
		(name) => {
			if (name.startsWith('node:')) return require(name);
			assert.equal(name, 'obsidian', 'Shell must not load unrelated runtime packages');
			return obsidianWithApp;
		}, module, module.exports,
	);
	const plugin = new module.exports.default();
	plugin.app.vault.adapter = new obsidianWithApp.FileSystemAdapter();
	await plugin.onload();
	return { plugin, registrations, leaves, revealed, notices, workspace, saved };
}

test('enabling registers native chat entrypoints without service or demo side effects', async () => {
	const { registrations, leaves, revealed, notices } = await createShell();
	assert.deepEqual([...registrations.views.keys()], ['opencode-chat']);
	assert.deepEqual(registrations.commands.map(({ id, name }) => ({ id, name })), [
		{ id: 'open-chat', name: 'Open chat' },
	]);
	assert.equal(registrations.ribbons.length, 1);
	assert.equal(registrations.ribbons[0].icon, 'message-square');
	assert.equal(registrations.ribbons[0].title, 'Open chat');
	assert.deepEqual(leaves, []);
	assert.deepEqual(revealed, []);
	assert.deepEqual(notices, []);
	assert.ok(Object.keys(bundle.metafile.inputs).includes('src/opencode/discovery.ts'));
});

test('command opens a native tab and ribbon reveals the same leaf, including in a sidebar', async () => {
	const { registrations, leaves, revealed } = await createShell();
	await registrations.commands[0].callback();
	assert.equal(leaves.length, 1);
	assert.deepEqual(leaves[0].state, { type: 'opencode-chat', active: true });
	leaves[0].location = 'sidebar';
	await registrations.ribbons[0].callback();
	assert.equal(leaves.length, 1);
	assert.deepEqual(revealed, [leaves[0], leaves[0]]);
});

test('native view renders the conversation shell and clears its content on close', async () => {
	const { registrations, plugin } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	view.connection.discover = async () => emptyClient();
	await view.onOpen();
	assert.equal(view.getViewType(), 'opencode-chat');
	assert.equal(view.getDisplayText(), 'OpenCode');
	assert.equal(view.getIcon(), 'message-square');
	assert.ok(view.contentEl.classList.contains('opencode-chat'));
	assert.match(view.statusEl.textContent, /Connected · Shared service/);
	assert.equal(view.retryButton.textContent, 'Retry discovery');
	assert.ok(view.messagesEl);
	assert.ok(view.composer);
	assert.ok(view.interactionsEl);
	const card = view.contentEl.querySelector('.opencode-composer-card');
	assert.ok(card, 'The composer renders as one card');
	assert.equal(card.parentElement.classList.contains('opencode-chat-composer'), true);
	assert.ok(card.querySelector('.opencode-chat-input') === view.composer);
	assert.ok(card.querySelector('.opencode-composer-toolbar-start'));
	assert.ok(card.querySelector('.opencode-composer-toolbar-end'));
	assert.ok(card.querySelector('.opencode-chat-prompt-actions'));
	assert.equal(view.sendButton.getAttribute('aria-label'), 'Send message');
	assert.match(view.sendButton.title, /Ctrl\/Cmd\+Enter/);
	assert.ok(view.sendButton.querySelector('.lucide-arrow-up'), 'Send uses the arrow-up icon');
	assert.equal(view.stopButton.getAttribute('aria-label'), 'Stop execution');
	assert.match(view.stopButton.title, /interrupt/i);
	assert.ok(view.stopButton.querySelector('.lucide-square'), 'Stop uses the square icon');
	assert.equal(view.stopButton.hidden, true, 'Stop is absent while idle');
	assert.ok(view.agentSelect.getAttribute('aria-label'));
	assert.ok(view.modelSelect.getAttribute('aria-label'));
	assert.match(view.composer.placeholder, /^Plan, build, or ask\./);
	assert.equal(view.composer.getAttribute('aria-label'), 'Message OpenCode');
	const labels = [...card.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label').toLowerCase());
	assert.deepEqual(labels.filter((label) => /attach|voice|microphone|shield|command|skill/.test(label)), [],
		'The card exposes no unsupported controls');
	const classes = [...card.querySelectorAll('*')].flatMap((element) => [...element.classList]);
	assert.deepEqual(classes.filter((name) => /attach|voice|microphone|shield|command|skill/.test(name)), []);
	await view.onOpen();
	assert.equal(view.contentEl.querySelectorAll('.opencode-chat-header').length, 1);
	await view.onClose();
	assert.equal(view.contentEl.childElementCount, 0);
	assert.equal(view.contentEl.classList.contains('opencode-chat'), false);
	plugin.unload();
});

test('opening failures provide fixed feedback without leaking underlying errors', async () => {
	const { registrations, workspace, notices } = await createShell();
	workspace.getLeaf = () => { throw new Error('private diagnostic'); };
	await registrations.commands[0].callback();
	assert.deepEqual(notices, ['Unable to open chat. Try opening it again.']);
});

test('view exposes explicit discovery retry and never displays unknown diagnostic errors', async () => {
	const { registrations, plugin } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	let calls = 0;
	view.connection.discover = async () => { if (++calls === 1) throw new Error('private password'); return emptyClient(); };
	await view.onOpen();
	assert.match(view.statusEl.textContent, /Retrying in 500 ms/);
	assert.doesNotMatch(view.statusEl.textContent, /private password/);
	assert.equal(view.retryButton.disabled, true);
	// Let the scheduled backoff run, or use the explicit retry after exhaustion.
	const pending = view.synchronization.retry();
	await pending;
	assert.equal(calls, 2);
	assert.match(view.statusEl.textContent, /Connected · Shared service/);
	plugin.unload();
});

test('view reports managed startup and the managed-versus-shared connection source', async () => {
	const { registrations, plugin } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	let mode = 'managed';
	let phase = 'starting';
	Object.defineProperty(view.connection, 'status', {
		configurable: true,
		get: () => ({ mode, phase }),
	});
	let finish;
	view.connection.discover = () => new Promise((resolve) => { finish = resolve; });
	const opening = view.onOpen();
	await new Promise(setImmediate);
	assert.match(view.statusEl.textContent, /Starting OpenCode…/);
	phase = 'running';
	finish(emptyClient());
	await opening;
	assert.match(view.statusEl.textContent, /Connected · Managed service/);
	plugin.unload();
});

test('desktop metadata and version mapping consistently use the new identity', async () => {
	const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
	const manifest = await readJson('../manifest.json');
	const versions = await readJson('../versions.json');
	const pkg = await readJson('../package.json');
	const lock = await readJson('../package-lock.json');
	assert.equal(manifest.id, 'opencode-chat');
	assert.equal(manifest.name, 'OpenCode');
	assert.equal(manifest.isDesktopOnly, true);
	assert.equal(manifest.minAppVersion, '1.14.5');
	assert.equal(versions[manifest.version], manifest.minAppVersion);
	assert.equal(pkg.name, manifest.id);
	assert.equal(lock.name, pkg.name);
	assert.equal(lock.packages[''].name, pkg.name);
	assert.equal(pkg.version, manifest.version);
});

test('concurrent views share discovery; close releases handlers without affecting another view or reopen', async () => {
	const { registrations, plugin } = await createShell();
	const factory = registrations.views.get('opencode-chat');
	const first = factory({});
	const second = factory({});
	assert.equal(first.connection, second.connection);
	assert.equal(first.synchronization, second.synchronization);
	let finish;
	let discoveries = 0;
	first.connection.discover = () => {
		discoveries++;
		return new Promise((resolve) => { finish = resolve; });
	};
	const a = first.onOpen();
	const b = second.onOpen();
	await new Promise(setImmediate);
	assert.equal(discoveries, 1);
	const oldStatus = first.statusEl;
	await first.onClose();
	assert.equal(first.contentEl.childElementCount, 0);
	assert.equal(first.connection.signal.aborted, false);
	finish(emptyClient());
	await Promise.all([a, b]);
	assert.equal(oldStatus.textContent, 'Synchronizing conversation…', 'Closed DOM must not receive late connection results');
	assert.match(second.statusEl.textContent, /Connected · Shared service/);
	await first.onOpen();
	assert.match(first.statusEl.textContent, /Connected · Shared service/);
	assert.equal(discoveries, 1, 'Reopen reuses the plugin connection');
	first.unload();
	assert.equal(first.contentEl.childElementCount, 0);
	assert.equal(first.connection.signal.aborted, false, 'Unloading one view is not plugin unload');
	plugin.unload();
});

test('close/reopen before discovery settles updates only the current opening', async () => {
	const { registrations, plugin } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	let finish;
	view.connection.discover = () => new Promise((resolve) => { finish = resolve; });
	const oldOpen = view.onOpen();
	await new Promise(setImmediate);
	const oldStatus = view.statusEl;
	await view.onClose();
	const newOpen = view.onOpen();
	await new Promise(setImmediate);
	finish(emptyClient());
	await Promise.all([oldOpen, newOpen]);
	assert.equal(oldStatus.textContent, 'Synchronizing conversation…');
	assert.match(view.statusEl.textContent, /Connected · Shared service/);
	assert.equal(view.contentEl.querySelectorAll('.opencode-chat-header').length, 1);
	plugin.unload();
});

test('plugin unload cancels owned discovery and disposes all open view lifetimes', async () => {
	const { plugin, registrations } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	let finish;
	let signal;
	view.connection.discover = (ownedSignal) => {
		signal = ownedSignal;
		return new Promise((resolve) => { finish = resolve; });
	};
	const pending = view.onOpen();
	await new Promise(setImmediate);
	plugin.unload();
	plugin.unload();
	assert.equal(signal.aborted, true);
	assert.equal(view.contentEl.childElementCount, 0);
	finish(emptyClient());
	await pending;
	await assert.rejects(view.connection.connect());
	await view.onOpen();
	assert.equal(view.contentEl.childElementCount, 0, 'Disposed plugin cannot reopen or rediscover');
});

const wait = async () => { for (let i = 0; i < 40; i++) await new Promise((resolve) => setImmediate(resolve)); };

test('view-local Mod+Enter scope sends only from its composer and unregisters on close', async () => {
	const { plugin, registrations } = await createShell({ selectedSession: { id: 'old', directory: 'C:\\Vault' } });
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	document.body.appendChild(view.contentEl);
	const [handler] = view.scope.handlers;
	assert.deepEqual(handler.modifiers, ['Mod']);
	assert.equal(handler.key, 'Enter');
	assert.equal(handler.callback({ repeat: false }), true, 'An unfocused composer does not consume another control shortcut');
	view.composer.focus();
	view.composer.value = 'scope test';
	assert.equal(handler.callback({ repeat: false }), false);
	await wait();
	assert.equal(fixture.calls.filter(call => call[0] === 'prompt').length, 1);
	assert.equal(handler.callback({ repeat: true }), false, 'Held key is consumed without resending');
	await view.onClose();
	assert.equal(view.scope.handlers.size, 0);
	await view.onOpen();
	assert.equal(view.scope.handlers.size, 1, 'Reopen installs one handler, not duplicates');
	view.contentEl.remove();
	plugin.unload();
});

function interactionClient() {
	const records = new Map([
		['old', { id: 'old', title: 'Old', location: { directory: 'C:\\Vault' }, agent: 'plan', model: { providerID: 'p', id: 'm1' } }],
		['new', { id: 'new', title: 'New', location: { directory: 'C:\\Vault' }, agent: 'plan', model: { providerID: 'p', id: 'm1' } }],
		['foreign', { id: 'foreign', title: 'Foreign', location: { directory: 'C:\\Other' } }],
	]);
	const texts = new Map([['old', [{ id: 'old-message', type: 'user', text: 'old transcript', time: { created: 1 } }]],
		['new', [{ id: 'new-message', type: 'user', text: 'new transcript', time: { created: 2 } }]]]);
	const calls = [];
	let created = 0;
	const client = {
		event: liveEvents,
		agent: { list: async () => ({ data: [
			{ id: 'plan', name: 'Plan', mode: 'primary', hidden: false },
			{ id: 'build', name: 'Build', mode: 'primary', hidden: false },
			{ id: 'secret', name: 'Secret', mode: 'primary', hidden: true },
			{ id: 'child', name: 'Child', mode: 'subagent', hidden: false },
		] }) },
		model: { list: async () => ({ data: [
			{ providerID: 'p', modelID: 'm1', name: 'One', enabled: true },
			{ providerID: 'p', modelID: 'm2', name: 'Two', enabled: true },
			{ providerID: 'p', modelID: 'off', name: 'Off', enabled: false },
		] }) },
		permission: { list: async () => [] },
		message: { list: async ({ sessionID, order }) => {
			calls.push(['messages', sessionID, order]);
			return { data: structuredClone(texts.get(sessionID) ?? []), cursor: {} };
		} },
		session: {
			list: async ({ directory }) => ({ data: [...records.values()].filter((session) => session.location.directory === directory), cursor: {} }),
			get: async ({ sessionID }) => records.get(sessionID),
			create: async ({ location }) => {
				created++;
				const session = { id: `created-${created}`, title: 'Created', location, agent: 'plan', model: { providerID: 'p', id: 'm1' } };
				records.set(session.id, session);
				texts.set(session.id, []);
				return session;
			},
			active: async () => Object.fromEntries([...records.keys()].map((id) => [id, { type: 'running' }])),
			form: { list: async () => [] },
			prompt: async (input) => {
				calls.push(['prompt', input]);
				return { id: input.id, sessionID: input.sessionID, type: 'user', payload: { text: input.text }, delivery: 'queue' };
			},
			interrupt: async (input) => { calls.push(['interrupt', input]); return { interrupted: true }; },
			switchAgent: async (input) => { calls.push(['switchAgent', input]); },
			switchModel: async (input) => { calls.push(['switchModel', input]); },
		},
	};
	return { client, calls, records, texts, get created() { return created; } };
}

test('empty and unavailable selection still allow choosing or creating a conversation', async () => {
	for (const saved of [undefined, { id: 'foreign', directory: 'C:\\Vault' }]) {
		const { plugin, registrations } = await createShell(saved ? { selectedSession: saved } : {});
		const view = registrations.views.get('opencode-chat')({});
		const fixture = interactionClient();
		view.connection.discover = async () => fixture.client;
		await view.onOpen();
		await wait();
		assert.equal(view.synchronization.canOperate, false);
		assert.equal(view.newButton.disabled, false);
		view.conversationSelect.value = 'old';
		view.conversationSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
		await wait();
		assert.equal(view.sessions.state.selected.id, 'old');
		plugin.unload();
	}
	const { plugin, registrations } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	fixture.records.clear();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	assert.equal(view.synchronization.canOperate, false);
	click(view.newButton);
	await wait();
	assert.equal(fixture.created, 1);
	assert.equal(view.sessions.state.selected.id, 'created-1');
	assert.equal(view.sendButton.disabled, true, 'Empty input is not sent automatically');
	plugin.unload();
});

test('conversation, agent, model, send, and stop controls use vault-scoped server state', async () => {
	const { plugin, registrations } = await createShell({ selectedSession: { id: 'old', directory: 'C:\\Vault' } });
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	const options = [...view.conversationSelect.options].map((option) => [option.value, option.textContent]);
	assert.deepEqual(options, [['old', 'Old'], ['new', 'New']]);
	assert.deepEqual([...view.agentSelect.options].map((option) => option.value), ['plan', 'build']);
	assert.deepEqual([...view.modelSelect.options].map((option) => option.value).length, 2);
	assert.equal(view.agentSelect.getAttribute('aria-label'), 'Agent: Plan');
	assert.equal(view.modelSelect.getAttribute('aria-label'), 'Model: p · One');
	assert.equal(view.modelSelect.title, 'Model: p · One', 'The full selected value is available as a tooltip');

	view.agentSelect.value = 'build';
	view.agentSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.deepEqual(fixture.calls.find((call) => call[0] === 'switchAgent')[1], { sessionID: 'old', agent: 'build' });

	view.modelSelect.value = JSON.stringify(['p', 'm2', '']);
	view.modelSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.deepEqual(fixture.calls.find((call) => call[0] === 'switchModel')[1],
		{ sessionID: 'old', model: { id: 'm2', providerID: 'p' } });

	view.composer.value = 'hello';
	view.composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	assert.equal(view.sendButton.disabled, false);
	view.composer.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
	await wait();
	const prompt = fixture.calls.find((call) => call[0] === 'prompt')[1];
	assert.match(prompt.id, /^msg_[0-9a-f-]{36}$/);
	assert.equal(prompt.text, 'hello');
	assert.equal(view.composer.value, '');

	view.conversationSelect.value = 'new';
	view.conversationSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.match(view.messagesEl.textContent, /new transcript/);
	assert.doesNotMatch(view.messagesEl.textContent, /old transcript/);

	click(view.newButton);
	await wait();
	assert.equal(fixture.created, 1);
	assert.equal(view.sessions.state.selected.id, 'created-1');

	await wait();
	assert.equal(view.stopButton.hidden, false, 'Stop is present while execution is running');
	assert.equal(view.stopButton.disabled, false);
	const interrupts = fixture.calls.filter((call) => call[0] === 'interrupt').length;
	click(view.stopButton);
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'interrupt').length, interrupts + 1);
	await view.onClose();
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'interrupt').length, interrupts + 1,
		'Closing the view must not interrupt execution');
	plugin.unload();
});

test('composer grows with its text up to 40vh and scrolls internally beyond the cap', async () => {
	const { plugin, registrations } = await createShell({ selectedSession: { id: 'old', directory: 'C:\\Vault' } });
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	const composer = view.composer;
	const setScrollHeight = (value) => Object.defineProperty(composer, 'scrollHeight', { configurable: true, get: () => value });
	setScrollHeight(72);
	composer.value = 'one\ntwo';
	composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	assert.equal(composer.style.getPropertyValue('--opencode-composer-input-height'), '72px', 'The field resets to its content height');
	assert.equal(composer.classList.contains('is-scrollable'), false);
	setScrollHeight(5000);
	composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	const height = parseFloat(composer.style.getPropertyValue('--opencode-composer-input-height'));
	assert.ok(Math.abs(height - window.innerHeight * 0.4) < 0.5, 'Growth stops at 40vh');
	assert.equal(composer.classList.contains('is-scrollable'), true, 'Longer text scrolls inside the field');
	plugin.unload();
});

test('plugin wires the filesystem vault path, persisted selection and authoritative reopen into its shared session owner', async () => {
	const { plugin, registrations, saved } = await createShell({
		executablePath: 'opencode', selectedSession: { id: 'saved', directory: 'C:\\Vault' },
		password: 'must not persist', messages: ['must not persist'],
	});
	const first = registrations.views.get('opencode-chat')({});
	const second = registrations.views.get('opencode-chat')({});
	assert.equal(first.sessions, second.sessions);
	let lists = 0;
	let loads = 0;
	const session = { id: 'saved', location: { directory: 'C:\\Vault' } };
	first.connection.discover = async () => ({
		event: liveEvents,
		agent: { list: async () => ({ data: [] }) },
		model: { list: async () => ({ data: [] }) },
		permission: { list: async () => [] },
		session: {
			active: async () => ({}),
			form: { list: async () => [] },
			list: async ({ directory }) => { assert.equal(directory, 'C:\\Vault'); lists++; return { data: [session], cursor: {} }; },
			get: async () => session,
			create: async () => assert.fail('Reopen must not create a session'),
		},
		message: { list: async () => ({ data: [{ id: `m${++loads}`, text: 'server snapshot' }], cursor: {} }) },
	});
	await Promise.all([first.onOpen(), second.onOpen()]);
	assert.equal(lists, 1);
	assert.equal(loads, 1);
	await first.onClose();
	await first.onOpen();
	assert.equal(loads, 2);
	assert.equal(first.sessions.state.messages[0].id, 'm2');
	assert.deepEqual(saved.at(-1), { executablePath: 'opencode', autoStart: true, selectedSession: { id: 'saved', directory: 'C:\\Vault' } });
	plugin.unload();
});
