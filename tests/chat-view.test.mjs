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
	workspace: {
		activeMarkdown: undefined,
		focused: true,
		getActiveViewOfType(type) {
			return this.focused && this.activeMarkdown instanceof type ? this.activeMarkdown : null;
		},
		getLeavesOfType() { return this.activeMarkdown ? [this.activeMarkdown.leaf] : []; },
		on() { return { e: { offref: () => undefined } }; },
	},
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

function fixture(autoAttachActiveNote = () => false, options = {}) {
	notices.length = 0;
	obsidian.modals.length = 0;
	obsidian.menus.length = 0;
	app.workspace.activeMarkdown = undefined;
	app.workspace.focused = true;
	app.metadataCache.getFirstLinkpathDest = () => null;
	const controller = new AbortController();
	const diffCalls = [];
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
			diff: async (input) => {
				diffCalls.push(input);
				if (options.diffFailure) throw options.diffFailure;
				return options.diffs ?? [];
			},
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
	let pendingPrompt;
	const synchronization = {
		get state() {
			const snapshot = sessions.state;
			return {
				phase: 'ready', attempt: 0, permissions: [], forms: [], agents: [], models: [],
				snapshot,
				...(pendingPrompt ? { pendingPrompt } : {}),
				conversation: { messages: snapshot.messages, execution: 'succeeded' },
			};
		},
		get canCompose() { return true; },
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		notify() { for (const listener of [...listeners]) listener(); },
		async openDraft() { await sessions.beginDraft(); this.notify(); },
		async open() { await sessions.open(); this.notify(); },
		async sendMessage() { return true; },
		settleAdmitted(text = '') { pendingPrompt = { id: 'prompt', text, phase: 'admitted' }; },
		async retry() {}, async retryPrompt() {}, async stop() {},
		async setAgent() {}, async setModel() {}, async loadOptions() {},
		async loadSkills() { return []; }, async loadCommands() { return []; },
		replyPermission() {}, replyForm() {}, cancelForm() {},
		dismissPrompt() { return undefined; },
		rejectIncompatible() { return false; },
	};
	const connection = { signal: new AbortController().signal, connect: async () => client };
	const view = new ChatView({ parent: {}, getViewState: () => ({}) }, connection, sessions,
		synchronization, () => false, autoAttachActiveNote);
	const titleParent = document.createElement('div');
	titleParent.className = 'view-header-title-parent';
	const title = document.createElement('div');
	title.className = 'view-header-title';
	view.containerEl.appendChild(titleParent);
	view.containerEl.appendChild(title);
	return { view, sessions, synchronization, records, messages, titleParent, title, client, diffCalls };
}

async function openOnParent(autoAttachActiveNote) {
	const f = fixture(autoAttachActiveNote);
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

const noteFile = (path) => ({
	path,
	basename: path.split('/').at(-1).replace(/\.md$/u, ''),
	extension: 'md',
	stat: { size: 10 },
});

function attachMenu(f) {
	click(f.view.attachButton);
	return obsidian.menus.at(-1);
}

function attach(f, title) {
	const menu = attachMenu(f);
	const item = menu.items.find((entry) => entry.title === title);
	assert.ok(item, `The attach menu offers ${title}`);
	item.click();
}

test('attach actions follow the active note, chips remove, and the send carries one deduplicated note', async () => {
	const f = await openOnParent();
	const file = noteFile('Notes/Idea.md');
	let selection = 'original words';
	app.metadataCache.getFirstLinkpathDest = (linkpath) => linkpath === 'Idea' ? file : null;
	app.workspace.activeMarkdown = new obsidian.MarkdownView(file, { getSelection: () => selection });
	f.synchronization.notify();
	await wait();

	assert.equal(f.view.attachButton.hidden, false, 'An available source offers the attach icon');
	const menu = attachMenu(f);
	assert.deepEqual(menu.items.map((item) => item.title), ['Attach selection', 'Attach active note'],
		'Both sources appear in the native attach menu');
	f.view.composer.value = 'Use [[Idea]] please';
	f.view.composer.dispatchEvent(new Event('input', { bubbles: true }));

	attach(f, 'Attach selection');
	await wait();
	assert.equal(f.view.attachmentElements.length, 1);
	assert.match(f.view.attachmentElements[0].textContent, /Selection: original words/);

	attach(f, 'Attach active note');
	await wait();
	assert.equal(f.view.attachmentElements.length, 2, 'One chip per attached item');
	assert.equal(f.view.attachmentElements[1].textContent, 'Idea');

	click(f.view.attachmentElements[1]);
	await wait();
	assert.equal(f.view.attachmentElements.length, 1, 'Removing a chip drops only that item');
	assert.match(f.view.attachmentElements[0].textContent, /Selection: original words/);
	assert.equal(f.view.composer.value, 'Use [[Idea]] please', 'Removing a chip leaves the typed text unchanged');

	attach(f, 'Attach active note');
	await wait();
	selection = 'changed afterwards';

	let sent;
	f.synchronization.sendMessage = async (text, attachments) => {
		sent = { text, attachments };
		f.synchronization.settleAdmitted(text);
		return true;
	};
	click(f.view.sendButton);
	await wait();
	assert.equal(sent.text, 'Use [[Idea]] please');
	assert.deepEqual(sent.attachments.map((attachment) => attachment.kind), ['selection', 'note'],
		'The selection snapshot stays text; the reference and the chip attach one note');
	assert.equal(sent.attachments[0].text, 'original words',
		'A changed editor selection does not alter the attached snapshot');
	assert.equal(sent.attachments[1].file.path, file.path);
	assert.equal(f.view.attachmentElements.length, 0, 'Confirmed admission clears the chips');
	assert.equal(f.view.composer.value, '', 'Confirmed admission clears the message text');
});

test('resolved references attach notes without chips while aliases and headings resolve to the note', async () => {
	const f = await openOnParent();
	const file = noteFile('Notes/Idea.md');
	app.metadataCache.getFirstLinkpathDest = (linkpath) => linkpath === 'Idea' ? file : null;
	f.view.composer.value = 'Compare [[Idea|the idea]] with [[Idea#Heading]] and [[Missing]]';
	f.view.composer.dispatchEvent(new Event('input', { bubbles: true }));

	let sent;
	f.synchronization.sendMessage = async (text, attachments) => {
		sent = { text, attachments };
		f.synchronization.settleAdmitted(text);
		return true;
	};
	click(f.view.sendButton);
	await wait();
	assert.equal(sent.text, 'Compare [[Idea|the idea]] with [[Idea#Heading]] and [[Missing]]',
		'The visible references stay in the prompt text');
	assert.deepEqual(sent.attachments.map((attachment) => attachment.file.path), [file.path],
		'Both aliased and heading references attach the same note once; unresolved text attaches nothing');
	assert.deepEqual(notices, [], 'An unresolved reference is omitted silently without an attachment error');
});

test('attach actions are hidden without a selection or open note, and an oversized note is refused with a notice', async () => {
	const f = await openOnParent();
	assert.equal(f.view.attachButton.hidden, false, 'The attach icon stays available as the affordance');
	let menu = attachMenu(f);
	assert.deepEqual(menu.items.map((item) => item.title), ['Open a note or select text to attach'],
		'No source offers no attach action');
	assert.equal(menu.items[0].disabled, true);

	const large = noteFile('Big.md');
	large.stat = { size: 21 * 1024 * 1024 };
	app.workspace.activeMarkdown = new obsidian.MarkdownView(large, { getSelection: () => '  ' });
	f.synchronization.notify();
	await wait();
	menu = attachMenu(f);
	assert.deepEqual(menu.items.map((item) => item.title), ['Attach active note'],
		'A whitespace-only selection offers no selection action');
	menu.items[0].click();
	await wait();
	assert.equal(f.view.attachmentElements.length, 0, 'The oversized note is not attached');
	assert.match(notices.at(-1), /Big is larger than 20 MiB and was not attached/);
});

test('a lone open note is attachable while the chat view has focus', async () => {
	const f = await openOnParent();
	const file = noteFile('Notes/Idea.md');
	app.workspace.activeMarkdown = new obsidian.MarkdownView(file, { getSelection: () => 'selected words' });
	app.workspace.focused = false; // The note is open in another pane with the chat focused.
	const menu = attachMenu(f);
	assert.deepEqual(menu.items.map((item) => item.title), ['Attach selection', 'Attach active note'],
		'The focused note is not required when exactly one note is open');
	menu.items[1].click();
	await wait();
	assert.equal(f.view.attachmentElements.length, 1);
	assert.equal(f.view.attachmentElements[0].textContent, 'Idea');
});

test('automatic active-note attachment follows the preference', async () => {
	const file = noteFile('Notes/Idea.md');
	const sendWith = async (auto) => {
		const f = await openOnParent(auto);
		app.workspace.activeMarkdown = new obsidian.MarkdownView(file, { getSelection: () => '' });
		f.synchronization.notify();
		f.view.composer.value = 'plain message';
		f.view.composer.dispatchEvent(new Event('input', { bubbles: true }));
		let sent;
		f.synchronization.sendMessage = async (text, attachments) => {
			sent = { text, attachments };
			f.synchronization.settleAdmitted(text);
			return true;
		};
		click(f.view.sendButton);
		await wait();
		return sent;
	};

	assert.deepEqual((await sendWith(() => false)).attachments, [],
		'A disabled preference sends without the open note');
	const attached = await sendWith(() => true);
	assert.deepEqual(attached.attachments.map((attachment) => attachment.file.path), [file.path],
		'An enabled preference attaches the open note without a chip');
});

test('a confirmed command clears the text but keeps chips until a prompt admission', async () => {
	const f = await openOnParent();
	app.workspace.activeMarkdown = new obsidian.MarkdownView(noteFile('Notes/Idea.md'), { getSelection: () => '' });
	f.synchronization.notify();
	f.view.composer.value = '/review now';
	f.view.composer.dispatchEvent(new Event('input', { bubbles: true }));
	attach(f, 'Attach active note');
	await wait();
	assert.equal(f.view.attachmentElements.length, 1);

	f.synchronization.sendMessage = async () => true; // A command has no admission identity.
	click(f.view.sendButton);
	await wait();
	assert.equal(f.view.composer.value, '', 'A confirmed command still clears its text');
	assert.equal(f.view.attachmentElements.length, 1, 'Only a prompt admission clears the chips');
});

const changedAssistant = (id, start, end, files) => ({
	...assistant(id), snapshot: { start, end, files },
});
const changedDiff = (name = 'Notes/A.md') => ({
	file: name, patch: `--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-old\n+new`,
	additions: 1, deletions: 1, status: 'modified',
});

test('the conversation review opens from the view, is bounded to the conversation, and refreshes', async () => {
	const f = fixture(false, { diffs: [changedDiff()] });
	f.messages.set('parent', [user('p1', 'Fix the note.'), changedAssistant('a1', 's1', 's2', ['Notes/A.md'])]);
	await f.view.onOpen();
	await f.sessions.select('parent');
	f.synchronization.notify();
	await wait();

	const menu = new obsidian.Menu();
	f.view.onPaneMenu(menu, 'more-options');
	const review = menu.items.find((item) => item.title === 'Review changes in this conversation…');
	assert.ok(review, 'The document menu offers the review');
	assert.equal(review.disabled, false, 'A selected conversation enables it');

	review.click();
	await wait();
	const modal = obsidian.modals.at(-1);
	assert.equal(modal.titleEl.textContent, 'Changes in this conversation');
	assert.equal(modal.isOpen, true);
	assert.deepEqual(f.diffCalls.at(-1), { sessionID: 'parent', from: 'p1', to: 'p1' },
		'The review spans the conversation prompts (user message IDs)');
	const rows = modal.contentEl.querySelectorAll('details.opencode-file');
	assert.equal(rows.length, 1);
	assert.equal(rows[0].querySelector('.opencode-file-name').textContent, 'Notes/A.md');
	assert.equal(rows[0].querySelector('.opencode-file-meta').textContent, 'Modified · +1 −1');
	rows[0].open = true;
	rows[0].dispatchEvent(new Event('toggle'));
	assert.ok(rows[0].querySelector('.opencode-diff-line.is-add'));

	modal.close();
	f.view.reviewChanges();
	await wait();
	assert.equal(f.diffCalls.length, 2, 'The review always re-requests on open');
});

test('a failed turn diff leaves transcript, composer, permissions, and connection state untouched', async () => {
	const f = fixture(false, { diffFailure: new Error('private upstream detail') });
	f.messages.set('parent', [user('p1', 'Fix the note.'), changedAssistant('a1', 's1', 's2', ['Notes/A.md'])]);
	await f.view.onOpen();
	await f.sessions.select('parent');
	f.synchronization.notify();
	await wait();
	f.view.composer.value = 'unsent words';
	f.view.composer.dispatchEvent(new Event('input', { bubbles: true }));

	const beforeMessages = f.sessions.state.messages;
	const beforeSelected = f.sessions.state.selected;
	const beforePhase = f.synchronization.state.phase;
	const beforeComposer = f.view.composer.value;
	const beforeStatus = f.view.statusEl.textContent;
	const details = f.view.messagesEl.querySelector('details.opencode-turn-changes');
	assert.ok(details);
	details.open = true;
	details.dispatchEvent(new Event('toggle'));
	await wait();

	const error = details.querySelector('.opencode-diff-error');
	assert.match(error.textContent, /Unable to load changes\./);
	assert.equal(details.textContent.includes('private upstream detail'), false);
	assert.equal(details.querySelector('button').textContent, 'Retry');
	assert.equal(f.sessions.state.messages, beforeMessages, 'The transcript array is untouched');
	assert.equal(f.sessions.state.selected, beforeSelected, 'The selection is untouched');
	assert.equal(f.synchronization.state.phase, beforePhase, 'The connection phase is untouched');
	assert.deepEqual(f.synchronization.state.permissions, [], 'Permissions are untouched');
	assert.deepEqual(f.synchronization.state.forms, [], 'Forms are untouched');
	assert.equal(f.view.composer.value, beforeComposer, 'The composer text is untouched');
	assert.equal(f.view.statusEl.textContent, beforeStatus, 'The composer status is untouched');
	assert.match(f.view.messagesEl.textContent, /Found the note\./, 'The assistant answer is still shown');
});

test('opening and copying a reviewed file use the existing link and clipboard behavior', async () => {
	const f = fixture(false, { diffs: [changedDiff()] });
	f.messages.set('parent', [user('p1', 'Fix the note.'), changedAssistant('a1', 's1', 's2', ['Notes/A.md'])]);
	await f.view.onOpen();
	await f.sessions.select('parent');
	f.synchronization.notify();
	await wait();

	const openCalls = [];
	f.view.linkStack.open = (href, sourcePath) => openCalls.push({ href, sourcePath });
	app.metadataCache.getFirstLinkpathDest = (linkpath) =>
		linkpath === 'Notes/A.md' ? { path: 'Notes/A.md' } : null;
	const copied = [];
	Object.defineProperty(globalThis.navigator, 'clipboard', {
		configurable: true,
		value: { writeText: async (text) => { copied.push(text); } },
	});
	try {
		f.view.reviewChanges();
		await wait();
		const modal = obsidian.modals.at(-1);
		const row = modal.contentEl.querySelector('details.opencode-file');
		click(row.querySelector('button[aria-label="Open Notes/A.md"]'));
		assert.deepEqual(openCalls, [{ href: 'Notes/A.md', sourcePath: '' }],
			'Open reuses the vault link stack');
		click(row.querySelector('button[aria-label="Copy patch for Notes/A.md"]'));
		await wait();
		assert.match(copied[0], /@@ -1 \+1 @@/, 'The full patch text is copied');
		modal.close();
	} finally {
		delete globalThis.navigator.clipboard;
	}
});
