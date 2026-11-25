import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, createObsidian, installDom } from './dom-helper.mjs';

installDom();

const notices = [];
const app = {
	vault: {},
	workspace: {},
	scope: {},
	metadataCache: { getFirstLinkpathDest: () => null },
};
const obsidian = createObsidian(app, notices);

const bundle = await build({
	stdin: { contents: `export * from './src/ui/chat-view'; export * from './src/opencode/sessions';`,
		resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
const loader = createRequire(import.meta.url);
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : loader(name), module, module.exports);
const { ChatView, SessionCoordinator } = module.exports;

const wait = async () => { for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve)); };

const root = 'C:\\Vault';
const session = (id, title, parentID) => ({
	id, title, location: { directory: root }, time: { created: 1, updated: 1 },
	...(parentID ? { parentID } : {}),
});
const user = (id, text) => ({ id, type: 'user', text, time: { created: 1 } });
const assistant = (id) => ({
	id, type: 'assistant', agent: 'explore', model: { providerID: 'openai', id: 'gpt-5' },
	time: { created: 2, completed: 3 }, content: [{ type: 'text', text: 'Found the note.' }],
});
const report = (id, childID) => ({
	id, type: 'synthetic', time: { created: 2 },
	text: '<subagent>\n## Report\n\nFound the note.\n</subagent>',
	metadata: { source: 'subagent', agent: 'explore', description: 'Find the note', state: 'completed', childID },
});

function fixture() {
	notices.length = 0;
	obsidian.modals.length = 0;
	const controller = new AbortController();
	const records = new Map([
		['parent', session('parent', 'Parent conversation')],
		['child', session('child', 'Delegated task', 'parent')],
	]);
	const messages = new Map([
		['parent', [user('p1', 'Find the note.'), report('s1', 'child'), report('s2', 'missing')]],
		['child', [user('c1', 'You are a subagent. Find the note.'), assistant('a1')]],
	]);
	const client = {
		session: {
			list: async () => ({ data: [...records.values()], cursor: {} }),
			get: async ({ sessionID }) => {
				if (!records.has(sessionID)) throw { _tag: 'SessionNotFoundError', sessionID };
				return records.get(sessionID);
			},
		},
		message: { list: async ({ sessionID }) => ({ data: messages.get(sessionID) ?? [], cursor: {} }) },
	};
	const sessions = new SessionCoordinator({ signal: controller.signal, connect: async () => client }, () => root);
	const listeners = new Set();
	const synchronization = {
		get state() {
			const snapshot = sessions.state;
			return {
				phase: 'ready', attempt: 0, permissions: [], forms: [], agents: [], models: [],
				snapshot,
				conversation: { messages: snapshot.messages, execution: 'succeeded' },
			};
		},
		get canCompose() { return true; },
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		notify() { for (const listener of [...listeners]) listener(); },
		async openDraft() { await sessions.beginDraft(); this.notify(); },
		async open() { await sessions.open(); this.notify(); },
		async sendMessage() { return true; },
		async retry() {}, async retryPrompt() {}, async stop() {},
		async setAgent() {}, async setModel() {}, async loadOptions() {},
		async loadSkills() { return []; }, async loadCommands() { return []; },
		replyPermission() {}, replyForm() {}, cancelForm() {},
		dismissPrompt() { return undefined; },
		rejectIncompatible() { return false; },
	};
	const connection = { signal: new AbortController().signal };
	const view = new ChatView({ parent: {}, getViewState: () => ({}) }, connection, sessions,
		synchronization, () => false);
	const titleParent = document.createElement('div');
	titleParent.className = 'view-header-title-parent';
	const title = document.createElement('div');
	title.className = 'view-header-title';
	view.containerEl.appendChild(titleParent);
	view.containerEl.appendChild(title);
	return { view, sessions, synchronization, records, messages, titleParent, title };
}

async function openOnParent() {
	const f = fixture();
	await f.view.onOpen();
	await f.sessions.select('parent');
	f.synchronization.notify();
	await wait();
	return f;
}

function renameItem(f) {
	const menu = new obsidian.Menu();
	f.view.onPaneMenu(menu, '');
	return menu.items.find((item) => item.title === 'Rename conversation…');
}

test('opening a report switches to the child read-only and the parent crumb returns', async () => {
	const f = await openOnParent();
	assert.equal(f.sessions.selectedID, 'parent');
	assert.equal(renameItem(f).disabled, false, 'A top-level conversation can be renamed');
	assert.equal(f.title.getAttribute('contenteditable'), 'true');

	const link = f.view.messagesEl.querySelector('.markdown-embed-link');
	assert.ok(link, 'The report exposes its child link');
	click(link);
	await wait();

	assert.equal(f.sessions.selectedID, 'child');
	assert.equal(f.view.title, 'Delegated task');
	assert.equal(f.view.composer.hidden, true, 'The child composer input is hidden');
	assert.equal(f.view.messagesEl.querySelector('.opencode-composer-hint'), null);
	const hint = f.view.contentEl.querySelector('.opencode-composer-hint');
	assert.equal(hint.hidden, false);
	assert.equal(hint.textContent, 'Subagent session. Continue in Parent conversation.');
	assert.equal(f.view.messagesEl.querySelector('.callout-title-inner').textContent, 'Delegated task');
	assert.equal(f.title.getAttribute('contenteditable'), 'false', 'A child title is not a rename surface');
	assert.equal(renameItem(f).disabled, true, 'Rename is withheld in a child');

	const crumbs = [...f.view.containerEl.querySelectorAll('.view-header-breadcrumb')];
	assert.deepEqual(crumbs.map((crumb) => crumb.textContent), ['opencode', 'sessions', 'Parent conversation'],
		'The parent is appended between sessions and the child title');
	assert.equal(crumbs[2].hidden, false);

	click(crumbs[2]);
	await wait();
	assert.equal(f.sessions.selectedID, 'parent', 'Activating the parent crumb returns one level');
	assert.equal(f.view.title, 'Parent conversation');
	assert.equal(f.view.composer.hidden, false);
	assert.equal(f.title.getAttribute('contenteditable'), 'true');
	assert.equal(renameItem(f).disabled, false);
	assert.equal(f.view.containerEl.querySelectorAll('.view-header-breadcrumb')[2].hidden, true,
		'The parent crumb is gone outside a child');
});

test('a child that cannot be resolved shows a notice and leaves the parent transcript unchanged', async () => {
	const f = await openOnParent();
	const links = f.view.messagesEl.querySelectorAll('.markdown-embed-link');
	assert.equal(links.length, 2, 'Both reports carry a link, including the unresolvable one');
	click(links[1]);
	await wait();

	assert.equal(f.sessions.selectedID, 'parent');
	assert.equal(f.view.title, 'Parent conversation');
	assert.match(notices.at(-1), /Unable to open the subagent session/);
	assert.match(f.view.messagesEl.textContent, /Find the note\./);
	assert.equal(f.view.messagesEl.querySelectorAll('.opencode-message-subagent').length, 2);
});

test('opening a child with unsent composer text asks before discarding it', async () => {
	const f = await openOnParent();
	const link = f.view.messagesEl.querySelector('.markdown-embed-link');
	f.view.composer.value = 'unsent words';

	click(link);
	await wait();
	const modal = obsidian.modals.at(-1);
	assert.equal(modal.titleEl.textContent, 'Discard unsent message?');
	const [keep] = modal.contentEl.querySelectorAll('button');
	click(keep);
	await wait();
	assert.equal(f.sessions.selectedID, 'parent', 'Keeping the draft cancels the switch');
	assert.equal(f.view.composer.value, 'unsent words');

	click(link);
	await wait();
	click(obsidian.modals.at(-1).contentEl.querySelectorAll('button')[1]);
	await wait();
	assert.equal(f.sessions.selectedID, 'child');
	assert.equal(f.view.composer.value, '', 'Discarding clears the unsent text');
});
