import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { createObsidian, click, installDom } from './dom-helper.mjs';

installDom();

const bundle = await build({
	stdin: { contents: `export * from './src/ui/chat-renderer';`, resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
const obsidian = createObsidian({});
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { ChatRenderer } = module.exports;

const app = {
	vault: {},
	workspace: {},
	scope: {},
	metadataCache: { getFirstLinkpathDest: () => null },
};

const user = (id, text) => ({ id, type: 'user', text, time: { created: 1 } });
const session = (id, parentID) => ({
	id, title: id, location: { directory: 'C:\\Vault' }, time: { created: 1, updated: 1 },
	...(parentID ? { parentID } : {}),
});

function state(selected, messages) {
	return {
		phase: 'ready',
		attempt: 0,
		permissions: [],
		forms: [],
		agents: [],
		models: [],
		snapshot: { sessions: [], selected, messages: [] },
		conversation: { messages, execution: 'succeeded' },
	};
}

function fixture() {
	const content = document.createElement('div');
	const opening = new obsidian.Component();
	const calls = [];
	let sources = { selection: false, activeNote: false };
	const handlers = {
		retryConnection() {}, send() {}, retryPrompt() {}, dismissPrompt() {}, stop() {},
		setAgent() {}, setModel() {}, replyPermission() {}, replyForm() {}, cancelForm() {},
		loadOptions() {}, loadSkills: async () => {}, loadCommands: async () => {},
		openSubagent() {},
		attachSelection() { calls.push('selection'); },
		attachActiveNote() { calls.push('note'); },
		attachmentSources: () => sources,
	};
	const renderer = new ChatRenderer(app, handlers, () => false);
	renderer.mount(content, opening);
	return {
		content, opening, renderer, calls,
		setSources(value) { sources = value; },
	};
}

test('a delegated child renders read-only with the delegated-task label, and a top-level session restores the composer', () => {
	const { content, renderer } = fixture();
	const messages = [user('u1', 'You are a subagent. Find the note.')];

	renderer.refresh(state(session('child', 'parent'), messages), undefined, 'Parent conversation');
	assert.equal(content.querySelector('.opencode-composer-hint').hidden, false, 'The hint is visible');
	assert.equal(content.querySelector('.opencode-composer-hint').textContent,
		'Subagent session. Continue in Parent conversation.', 'The hint names the parent conversation');
	assert.equal(renderer.composerElement.hidden, true, 'The composer input is hidden');
	assert.equal(content.querySelector('.opencode-composer-toolbar').hidden, true,
		'No status or selector row remains');
	assert.equal(content.querySelector('.opencode-chat-prompt-actions').hidden, true);
	assert.ok(content.querySelector('.opencode-composer-card').classList.contains('is-readonly'),
		'The card centers its single hint');
	assert.equal(renderer.agentSelectElement.disabled, true);
	assert.equal(renderer.modelSelectElement.disabled, true);
	assert.equal(renderer.sendButtonElement.hidden, true);
	assert.equal(renderer.stopButtonElement.hidden, true);
	assert.equal(content.querySelector('.callout-title-inner').textContent, 'Delegated task');
	assert.equal(content.querySelector('.opencode-message-user').getAttribute('aria-label'), 'Delegated task');

	renderer.refresh(state(session('top'), [user('u2', 'Top-level prompt')]), undefined, undefined);
	assert.equal(content.querySelector('.opencode-composer-hint').hidden, true, 'The hint is gone');
	assert.equal(renderer.composerElement.hidden, false, 'The input is back');
	assert.equal(content.querySelector('.opencode-composer-toolbar').hidden, false, 'The status and controls are back');
	assert.equal(content.querySelector('.opencode-chat-prompt-actions').hidden, false);
	assert.equal(content.querySelector('.opencode-composer-card').classList.contains('is-readonly'), false);
	assert.equal(content.querySelector('.callout-title-inner').textContent, 'You', 'The default attribution is restored');
});

test('the attach icon sits beside Retry discovery and offers only available sources', () => {
	const f = fixture();
	const top = () => state(session('top'), []);
	f.renderer.refresh(top());
	const button = f.renderer.attachButtonElement;
	assert.ok(button);
	assert.equal(button.getAttribute('aria-label'), 'Attach selection or active note');
	assert.ok(button.classList.contains('clickable-icon'), 'The attach action uses the native icon-button surface');
	assert.ok(button.querySelector('.lucide-paperclip'), 'The attach action uses the paperclip icon');
	assert.equal(button.previousElementSibling, f.renderer.retryElement, 'The icon follows Retry discovery');
	assert.equal(button.hidden, false, 'The attach icon stays available as the affordance');

	click(button);
	let menu = obsidian.menus.at(-1);
	assert.deepEqual(menu.items.map((item) => item.title), ['Open a note or select text to attach']);
	assert.equal(menu.items[0].disabled, true, 'No source offers no attach action');
	assert.deepEqual(f.calls, []);

	f.setSources({ selection: true, activeNote: true });
	f.renderer.refreshComposer();
	click(button);
	menu = obsidian.menus.at(-1);
	assert.deepEqual(menu.items.map((item) => item.title), ['Attach selection', 'Attach active note']);
	menu.items[0].click();
	menu.items[1].click();
	assert.deepEqual(f.calls, ['selection', 'note'], 'Each menu item runs its action');

	f.setSources({ selection: false, activeNote: true });
	f.renderer.refresh(top());
	click(button);
	menu = obsidian.menus.at(-1);
	assert.deepEqual(menu.items.map((item) => item.title), ['Attach active note'],
		'No selection offers no selection action');

	f.setSources({ selection: true, activeNote: false });
	f.renderer.refresh(top());
	click(button);
	menu = obsidian.menus.at(-1);
	assert.deepEqual(menu.items.map((item) => item.title), ['Attach selection'],
		'No open note offers no active-note action');

	f.setSources({ selection: true, activeNote: true });
	f.renderer.refresh(state(session('child', 'parent'), []));
	assert.equal(button.hidden, true, 'A read-only subagent session offers no attach action');
});
