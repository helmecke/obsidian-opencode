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
const emptyClient = () => {
	let created = 0;
	return {
		event: liveEvents,
		agent: { list: async () => ({ data: [] }) },
		model: { list: async () => ({ data: [] }) },
		permission: { list: async () => [] },
		command: { list: async () => ({ data: [] }) },
		message: { list: async () => ({ data: [], cursor: {} }) },
		session: {
			list: async () => ({ data: [], cursor: {} }),
			get: async ({ sessionID }) => ({ id: sessionID, location: { directory: 'C:\\Vault' },
				time: { created: 1, updated: 1 } }),
			create: async ({ location }) => ({ id: `empty-${++created}`, location,
				time: { created: 1, updated: 1 } }),
			active: async () => ({}),
			form: { list: async () => [] },
		},
	};
};

const app = {
	workspace: {
		getLinkpathDest: () => null,
		openLinkText: async () => {},
		getLeavesOfType: () => [],
		getLeaf: () => ({ setViewState: async () => {} }),
		revealLeaf: async () => {},
	},
	metadataCache: { getFirstLinkpathDest: () => null },
	vault: {
		adapter: { getBasePath: () => 'C:\\Vault' },
		getMarkdownFiles: () => [
			{ basename: 'Alone', path: 'Alone.md', parent: { path: '' } },
			{ basename: 'Example', path: 'Notes/Example.md', parent: { path: 'Notes' } },
		],
	},
};

async function createShell(data = {}) {
	const registrations = { views: new Map(), commands: [], ribbons: [], settingTabs: [] };
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
			addSettingTab(tab) { registrations.settingTabs.push(tab); }
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
	return { plugin, registrations, leaves, revealed, notices, workspace, saved,
		Menu: obsidianWithApp.Menu, modals: obsidianWithApp.modals };
}

test('enabling registers native chat entrypoints without service or demo side effects', async () => {
	const { registrations, leaves, revealed, notices } = await createShell();
	assert.deepEqual([...registrations.views.keys()], ['opencode-chat']);
	assert.deepEqual(registrations.commands.map(({ id, name }) => ({ id, name })), [
		{ id: 'open-chat', name: 'Open chat' },
		{ id: 'review-conversation-changes', name: 'Review changes in this conversation' },
	]);
	assert.equal(registrations.ribbons.length, 1);
	assert.equal(registrations.ribbons[0].icon, 'message-square');
	assert.equal(registrations.ribbons[0].title, 'Open chat');
	assert.deepEqual(leaves, []);
	assert.deepEqual(revealed, []);
	assert.deepEqual(notices, []);
	assert.ok(Object.keys(bundle.metafile.inputs).includes('src/opencode/discovery.ts'));
});

test('the review command opens the review for an existing chat view', async () => {
	const { registrations, leaves } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	leaves.push({ type: 'opencode-chat', view });
	let reviewed = 0;
	view.reviewChanges = () => { reviewed++; };
	await registrations.commands.find(({ id }) => id === 'review-conversation-changes').callback();
	assert.equal(reviewed, 1, 'The command delegates to the open chat view');
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
	const headerContainer = view.containerEl.createDiv({ cls: 'view-header-title-container' });
	const headerParent = headerContainer.createDiv({ cls: 'view-header-title-parent' });
	headerContainer.createDiv({ cls: 'view-header-title' });
	view.leaf.tabHeaderInnerTitleEl = view.containerEl.createDiv({ cls: 'workspace-tab-header-inner-title' });
	view.connection.discover = async () => emptyClient();
	await view.onOpen();
	assert.equal(view.getViewType(), 'opencode-chat');
	assert.equal(view.getDisplayText(), 'New conversation');
	assert.equal(view.getIcon(), 'message-square');
	assert.ok(view.contentEl.classList.contains('opencode-chat'));
	assert.match(view.statusEl.textContent, /Connected · Shared service/);
	assert.ok(view.statusEl.classList.contains('is-icon-only'), 'Healthy status shows an icon');
	assert.ok(view.statusEl.querySelector('.opencode-chat-status-icon .lucide-plug'), 'Shared connections use the plug icon');
	assert.equal(view.retryButton.getAttribute('aria-label'), 'Retry discovery');
	assert.ok(view.retryButton.classList.contains('clickable-icon'), 'Retry discovery uses the native icon-button surface');
	assert.ok(view.retryButton.querySelector('.lucide-refresh-cw'), 'Retry discovery uses the refresh-cw icon');
	assert.ok(view.messagesEl);
	assert.ok(view.messagesEl.classList.contains('markdown-preview-view'),
		'The transcript carries Obsidian\'s reading-view class for reading typography');
	assert.ok(view.messagesEl.classList.contains('opencode-chat-messages'));
	assert.ok(view.composer);
	assert.ok(view.interactionsEl);
	assert.equal(view.sessions.state.selected, undefined, 'Opening shows a draft without a server session');
	assert.equal(view.containerEl.querySelector('.view-header-title').textContent, 'New conversation');
	assert.deepEqual([...headerParent.querySelectorAll('.view-header-breadcrumb')].map((item) => item.textContent),
		['opencode', 'sessions'], 'The header shows the native breadcrumb trail');
	assert.equal(headerParent.querySelectorAll('.view-header-breadcrumb-separator').length, 2);
	assert.equal(headerParent.querySelector('.view-header-breadcrumb').getAttribute('aria-label'), 'New conversation');
	assert.equal(view.leaf.tabHeaderInnerTitleEl.textContent, 'New conversation');
	const card = view.contentEl.querySelector('.opencode-composer-card');
	assert.ok(card, 'The composer renders as one card');
	assert.equal(card.parentElement.classList.contains('opencode-chat-composer'), true);
	assert.ok(card.querySelector('.opencode-chat-input') === view.composer);
	assert.ok(card.querySelector('.opencode-composer-toolbar-start'));
	assert.ok(card.querySelector('.opencode-composer-toolbar-end'));
	assert.ok(card.querySelector('.opencode-chat-prompt-actions'));
	const meta = card.querySelector('.opencode-composer-toolbar-start > .opencode-composer-meta');
	assert.ok(meta, 'The composer toolbar owns the meta group');
	assert.notEqual(card.firstElementChild, meta, 'The meta group is not a separate row above the message field');
	assert.ok(meta.contains(view.statusEl), 'Status lives in the composer toolbar');
	assert.ok(meta.contains(view.retryButton), 'Retry discovery lives in the composer toolbar');
	assert.equal(view.statusEl.getAttribute('role'), 'status');
	assert.equal(view.statusEl.getAttribute('aria-live'), 'polite');
	assert.equal(card.querySelector('.opencode-chat-select, [aria-label="Conversation"], [aria-label="New conversation"]'), null,
		'Conversation controls are not in the composer');
	assert.equal(view.contentEl.querySelectorAll('.opencode-chat-header, .opencode-chat-conversations').length, 0,
		'The transcript is not preceded by separate header rows');
	assert.equal(view.sendButton.getAttribute('aria-label'), 'Send message');
	assert.ok(view.sendButton.classList.contains('clickable-icon'), 'Send uses the native icon-button surface');
	assert.ok(view.sendButton.querySelector('.lucide-arrow-up'), 'Send uses the arrow-up icon');
	assert.equal(view.sendButton.hidden, false, 'Send is present while idle');
	assert.equal(view.sendButton.disabled, true, 'Empty input disables send');
	assert.equal(view.sendButton.getAttribute('aria-disabled'), 'true');
	assert.equal(view.stopButton.getAttribute('aria-label'), 'Stop execution');
	assert.ok(view.stopButton.classList.contains('clickable-icon'), 'Stop uses the native icon-button surface');
	assert.ok(view.stopButton.querySelector('.lucide-square'), 'Stop uses the square icon');
	assert.equal(view.stopButton.hidden, true, 'Stop is absent while idle');
	assert.equal(view.stopButton.disabled, true);
	assert.equal(view.stopButton.getAttribute('aria-disabled'), 'true');
	assert.ok(view.agentSelect.getAttribute('aria-label'));
	assert.ok(view.modelSelect.getAttribute('aria-label'));
	assert.match(view.composer.placeholder, /^Plan, build, or ask\./);
	assert.equal(view.composer.getAttribute('aria-label'), 'Message OpenCode');
	const labels = [...card.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label').toLowerCase());
	assert.deepEqual(labels.filter((label) => /voice|microphone|shield|command|skill/.test(label)), [],
		'The card exposes no unsupported controls');
	const classes = [...card.querySelectorAll('*')].flatMap((element) => [...element.classList]);
	assert.deepEqual(classes.filter((name) => /voice|microphone|shield|command|skill/.test(name)), []);
	assert.equal(view.attachButton.hidden, false, 'The attach affordance stays visible');
	assert.equal(view.attachButton.getAttribute('aria-label'), 'Attach selection or active note');
	assert.ok(view.attachButton.classList.contains('clickable-icon'), 'Attach uses the native icon-button surface');
	assert.ok(view.attachButton.querySelector('.lucide-paperclip'), 'Attach uses the paperclip icon');
	assert.equal(view.attachButton.previousElementSibling, view.retryButton, 'Attach sits beside Retry discovery');
	await view.onOpen();
	assert.equal(view.contentEl.querySelectorAll('.opencode-chat-header, .opencode-chat-conversations').length, 0);
	assert.equal(view.sessions.state.selected, undefined, 'Reopening returns to a fresh draft');
	assert.equal(headerParent.querySelectorAll('.view-header-breadcrumb').length, 2, 'Reopen does not duplicate breadcrumbs');
	const reopenedMeta = view.contentEl.querySelector('.opencode-composer-toolbar-start > .opencode-composer-meta');
	assert.ok(reopenedMeta?.contains(view.statusEl));
	assert.ok(reopenedMeta?.contains(view.retryButton));
	assert.equal(reopenedMeta?.querySelector('.opencode-chat-select'), null);
	await view.onClose();
	assert.equal(view.contentEl.childElementCount, 0);
	assert.equal(view.contentEl.classList.contains('opencode-chat'), false);
	plugin.unload();
});

test('view follows the readable line length setting and updates on config changes', async () => {
	const { registrations, plugin } = await createShell();
	const originalGetConfig = app.vault.getConfig;
	const originalOn = app.vault.on;
	let readable = true;
	const subscriptions = [];
	app.vault.getConfig = (key) => (key === 'readableLineLength' ? readable : undefined);
	app.vault.on = (name, callback) => {
		subscriptions.push({ name, callback });
		return { e: { offref() {} } };
	};
	try {
		const view = registrations.views.get('opencode-chat')({});
		view.connection.discover = async () => emptyClient();
		await view.onOpen();
		assert.ok(view.contentEl.classList.contains('is-readable-line-width'), 'The setting is on by default');
		assert.equal(subscriptions.length, 1);
		assert.equal(subscriptions[0].name, 'config-changed');
		readable = false;
		subscriptions[0].callback('readableLineLength');
		assert.equal(view.contentEl.classList.contains('is-readable-line-width'), false,
			'Turning the setting off releases the transcript to the pane width');
		readable = true;
		subscriptions[0].callback('strictLineBreaks');
		assert.equal(view.contentEl.classList.contains('is-readable-line-width'), false,
			'Unrelated settings do not change the transcript measure');
		subscriptions[0].callback('readableLineLength');
		assert.ok(view.contentEl.classList.contains('is-readable-line-width'));
		await view.onClose();
		assert.equal(view.contentEl.classList.contains('is-readable-line-width'), false,
			'Closing removes the native measure class');
		readable = false;
		await view.onOpen();
		assert.equal(view.contentEl.classList.contains('is-readable-line-width'), false,
			'Reopening reads the current setting');
		assert.equal(subscriptions.length, 2, 'Reopening installs one subscription, not duplicates');
		await view.onClose();
		plugin.unload();
	} finally {
		if (originalGetConfig) app.vault.getConfig = originalGetConfig;
		else delete app.vault.getConfig;
		if (originalOn) app.vault.on = originalOn;
		else delete app.vault.on;
	}
});

test('Show reasoning applies to an open transcript without reopening the view or reconnecting', async () => {
	const { plugin, registrations, leaves, saved } = await createShell({
		selectedSession: { id: 'old', directory: 'C:\\Vault' },
	});
	const view = registrations.views.get('opencode-chat')({});
	leaves.push({ type: 'opencode-chat', view });
	const fixture = interactionClient();
	fixture.client.message.list = async () => ({ data: [{
		id: 'reasoning-message', type: 'assistant', agent: 'plan', model: { providerID: 'p', id: 'm1' },
		time: { created: 10, completed: 20 },
		content: [
			{ type: 'reasoning', text: 'Weigh the options first.' },
			{ type: 'tool', id: 'tool-1', name: 'read', executed: true,
				state: { status: 'running', input: { filePath: 'Notes/Example.md' }, metadata: {} },
				time: { created: 11 } },
			{ type: 'text', text: 'Visible answer.' },
		],
	}], cursor: {} });
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	await selectSession(view, 'old');

	const tab = registrations.settingTabs.at(-1);
	const definition = tab.getSettingDefinitions().find((item) => item.name === 'Show reasoning');
	assert.ok(definition, 'The settings tab exposes Show reasoning');
	assert.equal(definition.control.type, 'toggle');
	assert.equal(tab.getControlValue('showReasoning'), false, 'An upgraded install starts with reasoning hidden');
	assert.equal(view.messagesEl.querySelector('.opencode-reasoning'), null);
	assert.match(view.messagesEl.textContent, /Visible answer\./);

	const reads = () => fixture.calls.filter((call) => call[0] === 'messages').length;
	const before = reads();
	const toolDetails = view.messagesEl.querySelector('details.opencode-tool');
	assert.ok(toolDetails, 'The tool part renders before the toggle');
	toolDetails.open = true;
	Object.defineProperty(view.messagesEl, 'scrollHeight', { configurable: true, value: 1000 });
	Object.defineProperty(view.messagesEl, 'clientHeight', { configurable: true, value: 500 });
	view.messagesEl.scrollTop = 200;
	await tab.setControlValue('showReasoning', true);
	assert.equal(saved.at(-1).showReasoning, true, 'The preference is persisted');
	const shown = view.messagesEl.querySelector('details.opencode-reasoning');
	assert.ok(shown, 'Enabling adds reasoning to the already open transcript');
	assert.equal(shown.open, false, 'It stays folded');
	assert.equal(shown.querySelector('.opencode-reasoning-preview').textContent, 'Weigh the options first.');
	assert.match(view.messagesEl.textContent, /Visible answer\./);
	assert.equal(reads(), before, 'The toggle re-renders without reading the service');
	assert.equal(view.messagesEl.querySelector('details.opencode-tool'), toolDetails,
		'The tool row keeps its element');
	assert.equal(toolDetails.open, true, 'Other expanded disclosures stay open');
	assert.equal(view.messagesEl.scrollTop, 200, 'The scroll position is preserved');

	await tab.setControlValue('showReasoning', false);
	assert.equal(view.messagesEl.querySelector('.opencode-reasoning'), null,
		'Disabling removes the reasoning row immediately');
	assert.match(view.messagesEl.textContent, /Visible answer\./);
	assert.equal(view.messagesEl.querySelector('details.opencode-tool'), toolDetails,
		'The tool row survives disabling');
	assert.equal(toolDetails.open, true, 'The expanded tool row stays open');
	assert.equal(view.messagesEl.scrollTop, 200, 'Disabling does not scroll the transcript');
	assert.equal(reads(), before, 'Disabling performs no network I/O');

	await tab.setControlValue('showReasoning', true);
	await view.onClose();
	await view.onOpen();
	await wait();
	await selectSession(view, 'old');
	assert.ok(view.messagesEl.querySelector('details.opencode-reasoning'),
		'Reopening the view follows the stored preference');
	plugin.unload();
});

test('the Show reasoning toggle is harmless before chat opens and with no conversation', async () => {
	const { plugin, registrations } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const tab = registrations.settingTabs.at(-1);
	const definition = tab.getSettingDefinitions().find((item) => item.name === 'Show reasoning');
	assert.equal(definition.control.type, 'toggle');
	await assert.doesNotReject(tab.setControlValue('showReasoning', true), 'Toggling with no open view does nothing');
	assert.equal(view.messagesEl, undefined, 'No renderer was created by the toggle');

	view.connection.discover = async () => emptyClient();
	await view.onOpen();
	await tab.setControlValue('showReasoning', false);
	assert.equal(view.messagesEl.querySelector('.opencode-reasoning'), null);
	assert.equal(view.sessions.state.selected, undefined, 'A draft has no transcript');
	await view.onClose();
	plugin.unload();
});

test('another conversation and non-chat leaves follow the stored reasoning preference', async () => {
	const { plugin, registrations, leaves } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const otherView = { getViewType: () => 'markdown' };
	leaves.push({ type: 'opencode-chat', view }, { type: 'markdown', view: otherView });
	const fixture = interactionClient();
	const assistant = (id, thought, answer) => ({
		id, type: 'assistant', agent: 'plan', model: { providerID: 'p', id: 'm1' },
		time: { created: 10, completed: 20 },
		content: [{ type: 'reasoning', text: thought }, { type: 'text', text: answer }],
	});
	fixture.client.message.list = async ({ sessionID }) => ({ data: [sessionID === 'old'
		? assistant('old-answer', 'Old thought.', 'Old answer.')
		: assistant('new-answer', 'New thought.', 'New answer.')], cursor: {} });
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	await selectSession(view, 'old');

	const tab = registrations.settingTabs.at(-1);
	const definition = tab.getSettingDefinitions().find((item) => item.name === 'Show reasoning');
	assert.equal(definition.control.type, 'toggle');
	await tab.setControlValue('showReasoning', true);
	assert.ok(view.messagesEl.querySelector('.opencode-reasoning'));

	await selectSession(view, 'new');
	assert.match(view.messagesEl.textContent, /New answer\./);
	assert.equal(view.messagesEl.querySelector('.opencode-reasoning-preview').textContent, 'New thought.',
		'A newly selected conversation reads the same live preference');
	assert.equal(leaves[1].view, otherView, 'A non-chat leaf is not touched');
	await view.onClose();
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
	assert.equal(view.statusEl.classList.contains('is-icon-only'), false, 'Errors keep their text');
	assert.equal(view.statusEl.querySelector('.opencode-chat-status-icon')?.hidden, true);
	assert.equal(view.retryButton.disabled, true);
	assert.equal(view.retryButton.getAttribute('aria-disabled'), 'true');
	// Let the scheduled backoff run, or use the explicit retry after exhaustion.
	const pending = view.synchronization.retry();
	await pending;
	assert.equal(calls, 2);
	assert.match(view.statusEl.textContent, /Connected · Shared service/);
	assert.equal(view.retryButton.disabled, false);
	assert.equal(view.retryButton.getAttribute('aria-disabled'), 'false');
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
	assert.ok(view.statusEl.querySelector('.opencode-chat-status-icon .lucide-server'), 'Managed connections use the server icon');
	plugin.unload();
});

test('desktop metadata and version mapping consistently use the new identity', async () => {
	const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
	const manifest = await readJson('../manifest.json');
	const versions = await readJson('../versions.json');
	const pkg = await readJson('../package.json');
	const lock = await readJson('../package-lock.json');
	assert.equal(manifest.id, 'opencode-chat');
	assert.equal(manifest.name, 'OpenCode Chat');
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
	assert.equal(view.contentEl.querySelectorAll('.opencode-chat-header, .opencode-chat-conversations').length, 0);
	const meta = view.contentEl.querySelector('.opencode-composer-toolbar-start > .opencode-composer-meta');
	assert.ok(meta?.contains(view.statusEl));
	assert.ok(meta?.contains(view.retryButton));
	assert.equal(meta?.querySelector('.opencode-chat-select, [aria-label="New conversation"]'), null);
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

async function selectSession(view, id) {
	await view.sessions.select(id);
	await view.synchronization.open();
	await wait();
}

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
		['old', { id: 'old', title: 'Old', location: { directory: 'C:\\Vault' }, agent: 'plan',
			model: { providerID: 'p', id: 'm1' }, time: { created: Date.now() - 2000, updated: Date.now() - 2000 } }],
		['new', { id: 'new', title: 'New', location: { directory: 'C:\\Vault' }, agent: 'plan',
			model: { providerID: 'p', id: 'm1' }, time: { created: Date.now() - 1000, updated: Date.now() - 1000 } }],
		['foreign', { id: 'foreign', title: 'Foreign', location: { directory: 'C:\\Other' },
			time: { created: 1, updated: 1 } }],
	]);
	const texts = new Map([['old', [{ id: 'old-message', type: 'user', text: 'old transcript', time: { created: 1 } }]],
		['new', [{ id: 'new-message', type: 'user', text: 'new transcript', time: { created: 2 } }]]]);
	const calls = [];
	let created = 0;
	const running = new Set(records.keys());
	const client = {
		event: liveEvents,
		agent: { list: async () => ({ data: [
			{ id: 'plan', name: 'Plan', mode: 'primary', hidden: false },
			{ id: 'build', name: 'Build', mode: 'primary', hidden: false },
			{ id: 'secret', name: 'Secret', mode: 'primary', hidden: true },
			{ id: 'child', name: 'Child', mode: 'subagent', hidden: false },
		] }) },
		model: { list: async () => ({ data: [
			{ providerID: 'p', modelID: 'm1', name: 'One', enabled: true, variants: [{ id: 'low' }, { id: 'high' }] },
			{ providerID: 'p', modelID: 'm2', name: 'Two', enabled: true, variants: [{ id: 'high' }] },
			{ providerID: 'p', modelID: 'off', name: 'Off', enabled: false },
		] }) },
		skill: { list: async () => {
			calls.push(['skills']);
			return { location: { directory: 'C:\\Vault' }, data: [
				{ id: 'skill-apply', name: 'apply', description: 'Apply a change', path: 'C:\\Vault\\skills\\apply.md', content: '# apply' },
				{ id: 'skill-build', name: 'build', path: 'C:\\Vault\\skills\\build.md', content: '# build' },
			] };
		} },
		command: { list: async () => {
			calls.push(['commands']);
			return { location: { directory: 'C:\\Vault' }, data: [
				{ name: 'review', description: 'Review the working tree' },
				{ name: 'team/review' },
				{ name: 'broken' },
			] };
		} },
		permission: { list: async () => [] },
		message: { list: async ({ sessionID, order }) => {
			calls.push(['messages', sessionID, order]);
			return { data: structuredClone(texts.get(sessionID) ?? []), cursor: {} };
		} },
		session: {
			list: async ({ directory }) => ({ data: [...records.values()].filter((session) => session.location.directory === directory), cursor: {} }),
			get: async ({ sessionID }) => records.get(sessionID),
			create: async (input) => {
				calls.push(['create', structuredClone(input)]);
				created++;
				const session = { id: `created-${created}`, title: input.title ?? 'Created',
					location: input.location, agent: input.agent ?? 'plan',
					model: input.model ?? { providerID: 'p', id: 'm1' },
					time: { created: Date.now(), updated: Date.now() + created } };
				records.set(session.id, session);
				texts.set(session.id, []);
				return session;
			},
			active: async () => Object.fromEntries([...running].map((id) => [id, { type: 'running' }])),
			form: { list: async () => [] },
			prompt: async (input) => {
				calls.push(['prompt', input]);
				return { id: input.id, sessionID: input.sessionID, type: 'user', payload: { text: input.text }, delivery: 'queue' };
			},
			command: async (input) => {
				calls.push(['command', input]);
				if (input.name === 'broken') throw new Error('rejected by the service');
			},
			interrupt: async (input) => { calls.push(['interrupt', input]); return { interrupted: true }; },
			update: async (input) => {
				calls.push(['update', structuredClone(input)]);
				const session = records.get(input.sessionID);
				if (session) records.set(input.sessionID, { ...session, title: input.title });
			},
			switchAgent: async (input) => { calls.push(['switchAgent', input]); },
			switchModel: async (input) => { calls.push(['switchModel', input]); },
		},
	};
	return { client, calls, records, texts, running, get created() { return created; } };
}

test('the document menu offers switch, new, rename, and review for both pane and tab sources', async () => {
	const { plugin, registrations, Menu } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	let switched = 0;
	let created = 0;
	let renamed = 0;
	let reviewed = 0;
	view.openSwitcher = async () => { switched++; };
	view.newConversation = async () => { created++; };
	view.beginTitleRename = () => { renamed++; };
	view.reviewChanges = () => { reviewed++; };
	for (const source of ['more-options', 'tab-header']) {
		const menu = new Menu();
		view.onPaneMenu(menu, source);
		assert.deepEqual(menu.items.map((item) => item.title),
			['Switch conversation…', 'New conversation', 'Rename conversation…', 'Review changes in this conversation…']);
		for (const item of menu.items) item.click();
	}
	assert.equal(switched, 2, 'Both sources open the switcher');
	assert.equal(created, 2, 'Both sources create a conversation');
	assert.equal(renamed, 2, 'Both sources start a rename');
	assert.equal(reviewed, 2, 'Both sources open the conversation review');
	plugin.unload();
});

test('header breadcrumbs start a new conversation and open the session switcher', async () => {
	const { plugin, registrations, modals } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const container = view.containerEl.createDiv({ cls: 'view-header-title-container' });
	const parent = container.createDiv({ cls: 'view-header-title-parent' });
	container.createDiv({ cls: 'view-header-title' });
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	await selectSession(view, 'old');
	assert.equal(view.sessions.state.selected.id, 'old');
	const [root, sessions] = parent.querySelectorAll('.view-header-breadcrumb');
	assert.equal(root.textContent, 'opencode');
	assert.equal(root.getAttribute('aria-label'), 'New conversation');
	assert.equal(sessions.textContent, 'sessions');
	assert.equal(sessions.getAttribute('aria-label'), 'Switch conversation');

	const title = container.querySelector('.view-header-title');
	title.dispatchEvent(new window.Event('focus'));
	assert.equal(parent.style.getPropertyValue('--opencode-breadcrumbs-opacity'), '0',
		'Editing collapses the parent breadcrumbs');
	await new Promise((resolve) => window.setTimeout(resolve, 180));
	assert.equal(parent.parentElement, null, 'The collapsed breadcrumbs detach after the transition');
	title.dispatchEvent(new window.Event('blur'));
	assert.equal(parent.parentElement, container, 'Leaving the title restores the breadcrumbs');
	assert.equal(parent.style.getPropertyValue('--opencode-breadcrumbs-opacity'), '1',
		'The breadcrumbs expand back');

	click(root);
	await wait();
	assert.equal(fixture.created, 0, 'opencode starts a draft without a server session');
	assert.equal(view.sessions.state.selected, undefined);
	assert.equal(view.getDisplayText(), 'New conversation');

	sessions.dispatchEvent(new window.KeyboardEvent('keydown',
		{ key: 'Enter', bubbles: true, cancelable: true }));
	await wait();
	const switcher = modals.at(-1);
	assert.equal(switcher.isOpen, true, 'sessions opens the quick switcher');
	assert.deepEqual(switcher.getItems().map((session) => session.id), ['new', 'old']);
	plugin.unload();
});

test('header and tab show the session title, inline rename commits or cancels, and external renames update the chrome', async () => {
	const { plugin, registrations, notices } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const header = view.containerEl.createDiv({ cls: 'view-header-title' });
	view.leaf.tabHeaderInnerTitleEl = view.containerEl.createDiv({ cls: 'workspace-tab-header-inner-title' });
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	await selectSession(view, 'old');
	assert.equal(header.textContent, 'Old');
	assert.equal(view.leaf.tabHeaderInnerTitleEl.textContent, 'Old');
	assert.equal(view.getDisplayText(), 'Old');

	const beginRename = () => {
		click(header);
		header.focus();
		return header.getAttribute('contenteditable') === 'true' ? header : undefined;
	};
	assert.equal(header.getAttribute('contenteditable'), 'true', 'The title is natively editable at rest');
	assert.equal(header.getAttribute('tabindex'), '0');
	assert.equal(header.getAttribute('role'), 'textbox');
	assert.equal(header.getAttribute('aria-label'), 'Conversation title');
	assert.equal(header.getAttribute('spellcheck'), 'false');
	let editor = beginRename();
	assert.ok(editor, 'Clicking the header starts an inline rename');
	header.textContent = 'Team notes';
	header.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	await wait();
	const update = fixture.calls.find((call) => call[0] === 'update');
	assert.deepEqual(update[1], { sessionID: 'old', title: 'Team notes' });
	assert.equal(header.textContent, 'Team notes', 'The server-confirmed title replaces the editor');
	assert.equal(view.leaf.tabHeaderInnerTitleEl.textContent, 'Team notes');
	const updates = fixture.calls.filter((call) => call[0] === 'update').length;

	editor = beginRename();
	assert.ok(editor);
	header.textContent = 'Discarded';
	header.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'update').length, updates, 'Escape sends nothing');
	assert.equal(header.textContent, 'Team notes');

	editor = beginRename();
	assert.ok(editor);
	header.textContent = '   ';
	header.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'update').length, updates, 'An empty title is rejected');
	assert.equal(header.textContent, 'Team notes');

	fixture.client.session.update = async () => { throw new Error('private upstream detail'); };
	editor = beginRename();
	assert.ok(editor);
	header.textContent = 'Broken';
	header.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	await wait();
	assert.deepEqual(notices, ['Unable to rename the conversation. Try again.']);
	assert.equal(header.textContent, 'Team notes', 'A failed rename keeps the previous title');
	assert.equal(notices.some((notice) => notice.includes('private')), false);

	const reads = fixture.calls.filter((call) => call[0] === 'messages').length;
	view.synchronization.applyInteraction({ id: 'rename', created: 10, type: 'session.renamed',
		location: { directory: 'C:\\Vault' },
		data: { sessionID: 'old', title: 'Renamed elsewhere' } });
	await wait();
	assert.equal(header.textContent, 'Renamed elsewhere', 'An external rename updates the header');
	assert.equal(view.leaf.tabHeaderInnerTitleEl.textContent, 'Renamed elsewhere');
	assert.equal(fixture.calls.filter((call) => call[0] === 'messages').length, reads,
		'An external rename does not rebuild the transcript');
	plugin.unload();
});

test('a new conversation is a client-side draft named locally and created on the first send', async () => {
	const { plugin, registrations, saved, Menu } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const header = view.containerEl.createDiv({ cls: 'view-header-title' });
	view.leaf.tabHeaderInnerTitleEl = view.containerEl.createDiv({ cls: 'workspace-tab-header-inner-title' });
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	assert.equal(fixture.created, 0, 'Opening creates no server session');
	assert.equal(view.getDisplayText(), 'New conversation');
	assert.equal(view.agentSelect.disabled, false, 'The draft agent is active');
	assert.equal(view.modelSelect.disabled, false, 'The draft model is active');
	assert.equal(view.agentSelect.value, 'build', 'The draft shows the default agent');
	assert.equal(view.modelSelect.value, JSON.stringify(['p', 'm1', '']), 'The draft shows the default model');
	assert.equal(view.contentEl.querySelector('.opencode-composer-choice[data-kind="agent"] .opencode-composer-choice-label').textContent,
		'Build');
	assert.equal(view.contentEl.querySelector('.opencode-composer-choice[data-kind="model"] .opencode-composer-choice-label').textContent,
		'One');
	assert.equal(view.variantSelect.disabled, false, 'The draft thinking selector is active');
	assert.equal(view.variantSelect.options.length, 3);

	view.agentSelect.value = 'plan';
	view.agentSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	view.modelSelect.value = JSON.stringify(['p', 'm2', '']);
	view.modelSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	view.variantSelect.value = 'high';
	view.variantSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.equal(view.sessions.state.draftAgent, 'plan');
	assert.deepEqual(view.sessions.state.draftModel, { providerID: 'p', id: 'm2', variant: 'high' });
	assert.deepEqual(saved.at(-1)?.lastModel, { providerID: 'p', id: 'm2', variant: 'high' },
		'The chosen model is remembered for later drafts');

	click(header);
	header.focus();
	header.textContent = 'Release notes';
	header.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	await wait();
	assert.equal(fixture.created, 0, 'Renaming a draft creates no server session');
	assert.equal(fixture.calls.filter((call) => call[0] === 'update').length, 0, 'No server rename is sent');
	assert.equal(header.textContent, 'Release notes');
	assert.equal(view.leaf.tabHeaderInnerTitleEl.textContent, 'Release notes');
	assert.equal(view.sessions.state.draftTitle, 'Release notes');

	view.composer.value = 'hello draft';
	view.composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	assert.equal(view.sendButton.disabled, false, 'A draft can send');
	view.composer.dispatchEvent(new window.KeyboardEvent('keydown',
		{ key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
	await wait();
	assert.equal(fixture.created, 1, 'The first send creates the session');
	const create = fixture.calls.find((call) => call[0] === 'create');
	assert.equal(create[1].title, 'Release notes');
	assert.deepEqual(create[1].location, { directory: 'C:\\Vault' });
	assert.equal(create[1].agent, 'plan');
	assert.deepEqual(create[1].model, { id: 'm2', providerID: 'p', variant: 'high' });
	assert.equal(view.sessions.state.selected.id, 'created-1');
	assert.equal(view.sessions.state.selected.title, 'Release notes');
	const prompt = fixture.calls.find((call) => call[0] === 'prompt');
	assert.equal(prompt[1].sessionID, 'created-1');
	assert.equal(prompt[1].text, 'hello draft');
	assert.equal(view.composer.value, '');

	const menu = new Menu();
	view.onPaneMenu(menu, 'more-options');
	menu.items[1].click();
	await wait();
	assert.equal(view.sessions.state.selected, undefined);
	assert.equal(view.agentSelect.value, 'build', 'A later draft returns to the default agent');
	assert.equal(view.modelSelect.value, JSON.stringify(['p', 'm2', '']),
		'A later draft reuses the remembered model');
	assert.equal(view.variantSelect.value, 'high');
	plugin.unload();
});

test('the switcher lists fresh sessions, marks the current one, and switching confirms unsent drafts without interrupting execution', async () => {
	const { plugin, registrations, modals, Menu } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	await selectSession(view, 'old');
	assert.equal(view.sessions.state.selected.id, 'old');

	let menu = new Menu();
	view.onPaneMenu(menu, 'more-options');
	menu.items[0].click();
	await wait();
	const switcher = modals.at(-1);
	assert.equal(switcher.isOpen, true);
	assert.deepEqual(switcher.getItems().map((session) => session.id), ['new', 'old'],
		'Fresh list, newest first, current vault only');
	const current = switcher.getItems().find((session) => session.id === 'old');
	const row = document.createElement('div');
	switcher.renderSuggestion({ item: current, match: { score: 0, matches: [] } }, row);
	assert.ok(row.classList.contains('is-current'), 'The current session is marked');
	assert.match(row.textContent, /Old/);
	assert.match(row.textContent, /Current/);
	assert.match(row.textContent, /just now|min ago/);

	switcher.onChooseItem(switcher.getItems().find((session) => session.id === 'new'));
	await wait();
	assert.equal(view.sessions.state.selected.id, 'new');
	assert.match(view.messagesEl.textContent, /new transcript/);

	view.composer.value = 'unsent draft';
	view.composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	menu = new Menu();
	view.onPaneMenu(menu, 'more-options');
	menu.items[0].click();
	await wait();
	const second = modals.at(-1);
	second.onChooseItem(second.getItems().find((session) => session.id === 'old'));
	await wait();
	const confirm = modals.at(-1);
	assert.equal(confirm.isOpen, true, 'Switching with a draft asks for confirmation');
	click(confirm.buttonContainerEl.querySelectorAll('button')[0]);
	await wait();
	assert.equal(view.sessions.state.selected.id, 'new', 'Keeping the draft leaves the selection unchanged');
	assert.equal(view.composer.value, 'unsent draft');

	const interrupts = fixture.calls.filter((call) => call[0] === 'interrupt').length;
	menu = new Menu();
	view.onPaneMenu(menu, 'more-options');
	menu.items[0].click();
	await wait();
	const third = modals.at(-1);
	third.onChooseItem(third.getItems().find((session) => session.id === 'old'));
	await wait();
	const discard = modals.at(-1);
	click(discard.buttonContainerEl.querySelectorAll('button')[1]);
	await wait();
	assert.equal(view.sessions.state.selected.id, 'old');
	assert.equal(view.composer.value, '', 'Discarding clears the composer');
	assert.match(view.messagesEl.textContent, /old transcript/);
	assert.equal(fixture.calls.filter((call) => call[0] === 'interrupt').length, interrupts,
		'Switching during execution does not stop the previous session');
	plugin.unload();
});

test('conversation, agent, model, send, and stop controls use vault-scoped server state', async () => {
	const { plugin, registrations, Menu } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	// Sending requires an idle conversation; the stop assertions below turn it back on.
	fixture.running.clear();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	await view.sessions.select('old');
	await view.synchronization.open();
	await wait();
	assert.deepEqual([...view.agentSelect.options].map((option) => option.value), ['plan', 'build']);
	assert.deepEqual([...view.modelSelect.options].map((option) => option.value).length, 2);
	assert.deepEqual([...view.variantSelect.options].map((option) => option.value), ['', 'low', 'high']);
	assert.equal(view.agentSelect.getAttribute('aria-label'), 'Agent: Plan');
	assert.equal(view.modelSelect.getAttribute('aria-label'), 'Model: p · One');
	assert.equal(view.modelSelect.title, 'Model: p · One', 'The full selected value is available as a tooltip');
	const modelChoice = view.contentEl.querySelector('.opencode-composer-choice[data-kind="model"]');
	assert.equal(modelChoice?.querySelector('.opencode-composer-choice-label')?.textContent, 'One',
		'The model trigger shows the model name without the provider');
	assert.ok(modelChoice?.querySelector('.lucide-sparkles'), 'The model trigger carries an icon');
	const variantChoice = view.contentEl.querySelector('.opencode-composer-choice[data-kind="variant"]');
	assert.equal(variantChoice?.hidden, false, 'Thinking is available when the model exposes variants');
	assert.equal(variantChoice?.querySelector('.opencode-composer-choice-label')?.textContent, 'default');
	const variantSlash = view.contentEl.querySelector('.opencode-composer-variant-slash');
	assert.ok(variantSlash, 'The thinking slash is rendered');
	assert.equal(variantChoice?.contains(variantSlash), false, 'The slash stays outside the thinking select box');
	assert.equal(view.variantSelect.getAttribute('aria-label'), 'Thinking: Default');
	const agentChoice = view.contentEl.querySelector('.opencode-composer-choice[data-kind="agent"]');
	assert.equal(agentChoice?.querySelector('.opencode-composer-choice-label')?.textContent, 'Plan');
	assert.ok(agentChoice?.querySelector('.lucide-circle-user-round'), 'The agent trigger carries an agent icon');

	view.agentSelect.value = 'build';
	view.agentSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.deepEqual(fixture.calls.find((call) => call[0] === 'switchAgent')[1], { sessionID: 'old', agent: 'build' });

	view.variantSelect.value = 'high';
	view.variantSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.deepEqual(fixture.calls.find((call) => call[0] === 'switchModel')[1],
		{ sessionID: 'old', model: { id: 'm1', providerID: 'p', variant: 'high' } });

	view.modelSelect.value = JSON.stringify(['p', 'm2', '']);
	view.modelSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
	await wait();
	assert.deepEqual(fixture.calls.filter((call) => call[0] === 'switchModel').at(-1)[1],
		{ sessionID: 'old', model: { id: 'm2', providerID: 'p' } });

	view.composer.value = 'hello';
	view.composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	assert.equal(view.sendButton.disabled, false);
	assert.equal(view.sendButton.getAttribute('aria-disabled'), 'false');
	view.composer.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
	await wait();
	const prompt = fixture.calls.find((call) => call[0] === 'prompt')[1];
	assert.match(prompt.id, /^msg_[0-9a-f-]{36}$/);
	assert.equal(prompt.text, 'hello');
	assert.equal(view.composer.value, '');
	assert.equal(view.sendButton.disabled, true, 'Empty input disables send again');
	assert.equal(view.sendButton.getAttribute('aria-disabled'), 'true');

	await view.selectConversation('new');
	await wait();
	assert.match(view.messagesEl.textContent, /new transcript/);
	assert.doesNotMatch(view.messagesEl.textContent, /old transcript/);

	const menu = new Menu();
	view.onPaneMenu(menu, 'more-options');
	menu.items[1].click();
	await wait();
	assert.equal(fixture.created, 0, 'New conversation stays a client-side draft');
	assert.equal(view.sessions.state.selected, undefined);
	assert.equal(view.getDisplayText(), 'New conversation');

	fixture.running.add('old');
	await selectSession(view, 'old');
	assert.equal(view.stopButton.hidden, false, 'Stop is present while execution is running');
	assert.equal(view.sendButton.hidden, true, 'Stop replaces Send while execution is running');
	assert.equal(view.stopButton.disabled, false);
	assert.equal(view.stopButton.getAttribute('aria-disabled'), 'false');
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

test('composer pairs brackets through programmatic edits, opens note completion, and still sends while open', async () => {
	const { plugin, registrations } = await createShell({ selectedSession: { id: 'old', directory: 'C:\\Vault' } });
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	const composer = view.composer;
	const press = (key, extra = {}) => composer.dispatchEvent(
		new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));

	view.composer.focus();
	assert.equal(view.sendButton.disabled, true);
	press('[');
	assert.equal(composer.value, '[]');
	assert.equal(composer.selectionStart, 1);
	assert.equal(view.sendButton.disabled, false, 'A programmatic pairing edit enables send');
	press('[');
	assert.equal(composer.value, '[[]]');
	assert.equal(composer.selectionStart, 2);
	assert.equal(composer.__suggest.isOpen, true, 'Typing [[ opens note completion');
	assert.deepEqual(composer.__suggest.suggestions.map((entry) => entry.file.basename), ['Alone', 'Example']);
	press('Backspace');
	assert.equal(composer.value, '[]', 'Backspacing the empty inner pair removes both brackets');
	assert.equal(composer.selectionStart, 1);
	press(']');
	assert.equal(composer.value, '[]', 'A typed closer skips the existing pair');
	assert.equal(composer.selectionStart, 2);

	composer.value = '';
	composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	press('[');
	press('[');
	assert.equal(composer.__suggest.isOpen, true);
	press('Enter', { ctrlKey: true });
	await wait();
	const prompt = fixture.calls.filter((call) => call[0] === 'prompt').at(-1)[1];
	assert.equal(prompt.text, '[[]]', 'Ctrl+Enter sends while the popover is open');

	assert.equal(fixture.calls.filter((call) => call[0] === 'skills').length, 0,
		'Note completion does not request the skill catalog');
	composer.value = '$';
	composer.setSelectionRange(1, 1);
	composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'skills').length, 1,
		'The first $ query requests the catalog once');
	assert.deepEqual(composer.__suggest.suggestions.map((entry) => entry.skill.name), ['apply', 'build']);
	composer.__suggest.selectSuggestion(composer.__suggest.suggestions[0], {});
	assert.equal(composer.value, '$apply ', 'Selecting a skill inserts the trailing-space mention');
	assert.equal(composer.selectionStart, 7);
	press('Enter', { ctrlKey: true });
	await wait();
	const skillPrompt = fixture.calls.filter((call) => call[0] === 'prompt').at(-1)[1];
	assert.equal(skillPrompt.text, '$apply ');
	assert.deepEqual(skillPrompt.skills, [{ id: 'skill-apply' }]);
	assert.equal(fixture.calls.filter((call) => call[0] === 'skills').length, 1,
		'A typed send reuses the loaded catalog');
	plugin.unload();
});

test('slash completion loads the command catalog only after the first / and inserts without sending', async () => {
	const { plugin, registrations } = await createShell({ selectedSession: { id: 'old', directory: 'C:\\Vault' } });
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'commands').length, 0,
		'No command catalog request before the first /');
	const composer = view.composer;
	composer.focus();
	composer.value = '/';
	composer.setSelectionRange(1, 1);
	composer.dispatchEvent(new window.Event('input', { bubbles: true }));
	await wait();
	assert.equal(fixture.calls.filter((call) => call[0] === 'commands').length, 1,
		'The first / requests the catalog once');
	assert.equal(composer.__suggest.isOpen, true);
	assert.deepEqual(composer.__suggest.suggestions.map((entry) => entry.command.name),
		['broken', 'review', 'team/review']);
	composer.__suggest.selectSuggestion(
		composer.__suggest.suggestions.find((entry) => entry.command.name === 'review'), {});
	assert.equal(composer.value, '/review ');
	assert.equal(composer.selectionStart, 8);
	assert.equal(fixture.calls.filter((call) => call[0] === 'prompt').length, 0, 'Selection does not send');
	plugin.unload();
});

test('a confirmed command clears the composer while a failed command keeps its text and reports an error', async () => {
	const { plugin, registrations } = await createShell();
	const view = registrations.views.get('opencode-chat')({});
	const fixture = interactionClient();
	view.connection.discover = async () => fixture.client;
	await view.onOpen();
	await wait();
	const composer = view.composer;
	const send = async (value) => {
		composer.focus();
		composer.value = value;
		composer.setSelectionRange(value.length, value.length);
		composer.dispatchEvent(new window.Event('input', { bubbles: true }));
		composer.dispatchEvent(new window.KeyboardEvent('keydown',
			{ key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
		await wait();
	};

	await send('/review src/auth.ts');
	assert.deepEqual(fixture.calls.find((call) => call[0] === 'command')[1],
		{ sessionID: 'created-1', name: 'review', text: 'src/auth.ts' });
	assert.equal(fixture.calls.filter((call) => call[0] === 'prompt').length, 0,
		'A known command is not sent as prompt text');
	assert.equal(composer.value, '', 'A confirmed command clears the composer');

	await send('/broken keep me');
	assert.equal(composer.value, '/broken keep me', 'A failed command keeps its text');
	const card = view.contentEl.querySelector('.opencode-composer-card');
	assert.match(card.textContent, /Unable to run the command/,
		'The composer card reports the command failure beside the retained text');
	assert.doesNotMatch(view.contentEl.querySelector('.opencode-chat-errors').textContent,
		/Unable to run the command/, 'The same command error is not duplicated above the transcript');
	assert.equal(fixture.calls.filter((call) => call[0] === 'command').length, 2,
		'A failed command is never automatically resent');
	plugin.unload();
});

test('plugin opens a client-side draft and creates the server session on the first turn', async () => {
	const { plugin, registrations, saved } = await createShell({
		executablePath: 'opencode',
		password: 'must not persist', messages: ['must not persist'],
	});
	const first = registrations.views.get('opencode-chat')({});
	const second = registrations.views.get('opencode-chat')({});
	assert.equal(first.sessions, second.sessions);
	let lists = 0;
	let loads = 0;
	let created = 0;
	const creates = [];
	const prompts = [];
	const records = new Map();
	const session = (id, title) => ({ id, title, location: { directory: 'C:\\Vault' },
		time: { created: 1, updated: 1 } });
	first.connection.discover = async () => ({
		event: liveEvents,
		agent: { list: async () => ({ data: [] }) },
		model: { list: async () => ({ data: [] }) },
		permission: { list: async () => [] },
		session: {
			active: async () => ({}),
			form: { list: async () => [] },
			list: async ({ directory }) => { assert.equal(directory, 'C:\\Vault'); lists++; return { data: [...records.values()], cursor: {} }; },
			get: async ({ sessionID }) => records.get(sessionID),
			create: async (input) => {
				creates.push(structuredClone(input));
				const createdSession = session(`saved-${++created}`, input.title);
				records.set(createdSession.id, createdSession);
				return createdSession;
			},
			prompt: async (input) => {
				prompts.push(structuredClone(input));
				return { id: input.id, sessionID: input.sessionID, type: 'user',
					payload: { text: input.text }, delivery: 'queue' };
			},
		},
		message: { list: async ({ sessionID }) => ({ data: [{ id: `m${++loads}`, text: `snapshot ${sessionID}` }], cursor: {} }) },
	});
	await Promise.all([first.onOpen(), second.onOpen()]);
	assert.equal(lists, 1, 'Two concurrent opens share one snapshot pass');
	assert.equal(created, 0, 'Opening creates no server session');
	assert.equal(loads, 0);
	assert.equal(first.sessions.state.selected, undefined);
	assert.equal(first.getDisplayText(), 'New conversation');

	await first.sessions.setDraftTitle('First draft');
	first.synchronization.refreshSession();
	assert.equal(await first.synchronization.sendMessage('hello'), true);
	assert.equal(created, 1, 'The first turn creates exactly one session');
	assert.deepEqual(creates[0], { location: { directory: 'C:\\Vault' }, title: 'First draft' });
	assert.equal(first.sessions.state.selected.id, 'saved-1');
	assert.equal(prompts[0].sessionID, 'saved-1');
	assert.equal(prompts[0].text, 'hello');
	assert.equal(lists, 2);
	assert.equal(loads, 2);

	await first.onClose();
	await first.onOpen();
	assert.equal(created, 1, 'Reopening starts a draft, not another session');
	assert.equal(first.sessions.state.selected, undefined);
	assert.equal(first.getDisplayText(), 'New conversation');
	assert.equal(lists, 3);
	assert.equal(loads, 2);
	assert.deepEqual(saved, [], 'The selected session is never persisted');
	plugin.unload();
});
