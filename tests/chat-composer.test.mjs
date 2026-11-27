import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, createObsidian, installDom } from './dom-helper.mjs';

installDom();
const bundle = await build({ entryPoints: ['src/ui/chat-composer.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
const obsidian = createObsidian({});
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { ChatComposer } = module.exports;

const file = (path) => ({
	path,
	basename: path.split('/').at(-1).replace(/\.md$/u, ''),
	extension: 'md',
	stat: { size: 10 },
});
const note = (path) => ({ kind: 'note', file: file(path) });
const selection = (text, sourcePath = 'Note.md') => ({ kind: 'selection', text, sourcePath });

function state(pendingPrompt) {
	return {
		phase: 'ready',
		attempt: 0,
		permissions: [],
		forms: [],
		agents: [],
		models: [],
		snapshot: { sessions: [], selected: { id: 'one' } },
		...(pendingPrompt ? { pendingPrompt } : {}),
	};
}

function fixture(handlers = {}) {
	const container = document.createElement('div');
	const sent = [];
	const composer = new ChatComposer(container, {
		send() { sent.push(1); }, retryPrompt() {}, dismissPrompt() {}, setAgent() {}, setModel() {}, stop() {},
		completionOpen: () => false, ...handlers,
	});
	return { composer, sent };
}

/** A ready conversation with one selected session, overridable per case. */
function readyState(patch = {}) {
	return { ...state(), ...patch };
}

function press(element, init) {
	const event = new globalThis.window.KeyboardEvent('keydown',
		{ bubbles: true, cancelable: true, ...init });
	element.dispatchEvent(event);
	return event;
}

test('Enter sends from an available composer and is inert everywhere else', () => {
	const sending = fixture();
	sending.composer.update(state());
	sending.composer.setText('hello');
	assert.equal(press(sending.composer.element, { key: 'Enter' }).defaultPrevented, true);
	assert.equal(sending.sent.length, 1, 'Enter sends the message');

	for (const [name, patch, text] of [
		['empty text', {}, ''],
		['whitespace', {}, '   '],
		['running execution', { conversation: { execution: 'running', messages: [] } }, 'hello'],
		['a busy interaction', { interactionBusy: 'form' }, 'hello'],
		['an unconfirmed prompt', { pendingPrompt: { id: 'p', text: 'x', phase: 'uncertain' } }, 'hello'],
		['a not-ready view', { phase: 'synchronizing' }, 'hello'],
	]) {
		const blocked = fixture();
		blocked.composer.update(readyState(patch));
		blocked.composer.setText(text);
		assert.equal(press(blocked.composer.element, { key: 'Enter' }).defaultPrevented, true,
			`${name} still inserts no newline`);
		assert.equal(blocked.sent.length, 0, `${name} cannot send`);
	}

	const draft = fixture();
	draft.composer.update(readyState({ snapshot: { sessions: [], empty: 'none' } }));
	draft.composer.setText('first turn');
	press(draft.composer.element, { key: 'Enter' });
	assert.equal(draft.sent.length, 1, 'A client-side draft can send');
});

test('modified, composing, and repeated Enter never send', () => {
	for (const init of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true },
		{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
		const f = fixture();
		f.composer.update(state());
		f.composer.setText('hello');
		const event = press(f.composer.element, { key: 'Enter', ...init });
		assert.equal(f.sent.length, 0, JSON.stringify(init));
		assert.equal(event.defaultPrevented, false, `${JSON.stringify(init)} keeps the field's own behavior`);
	}
});

test('Enter defers to an open completion popover and sends once it closes', () => {
	let open = true;
	const f = fixture({ completionOpen: () => open });
	f.composer.update(state());
	f.composer.setText('hello');
	const first = press(f.composer.element, { key: 'Enter' });
	assert.equal(f.sent.length, 0, 'The popover keeps the key for its highlighted row');
	assert.equal(first.defaultPrevented, false, 'The popover can still confirm the row');

	open = false;
	press(f.composer.element, { key: 'Enter' });
	assert.equal(f.sent.length, 1, 'The next Enter sends once');
});

test('bracket pairing still applies its own edits and never sends', () => {
	const f = fixture();
	f.composer.update(state());
	f.composer.focus();
	f.composer.setText('');
	press(f.composer.element, { key: '[' });
	assert.equal(f.composer.text, '[]', 'An opening bracket still pairs');
	press(f.composer.element, { key: '[' });
	assert.equal(f.composer.text, '[[]]');
	press(f.composer.element, { key: 'Backspace' });
	assert.equal(f.composer.text, '[]', 'Backspacing the empty pair removes both');
	assert.equal(f.sent.length, 0);
});

test('one chip appears per attachment, hidden when empty, and removal keeps the typed text', () => {
	const f = fixture();
	f.composer.update(state());
	assert.equal(f.composer.attachmentElements.length, 0);
	assert.equal(f.composer.listAttachments().length, 0);

	f.composer.addAttachment(note('Folder/Plan.md'));
	f.composer.addAttachment(note('Folder/Plan.md'));
	f.composer.addAttachment(selection('quoted', 'Folder/Plan.md'));
	assert.equal(f.composer.attachmentElements.length, 2, 'A repeated note keeps one chip');
	assert.equal(f.composer.attachmentElements[0].textContent, 'Plan');
	assert.match(f.composer.attachmentElements[1].textContent, /Selection: quoted/);
	assert.equal(f.composer.attachmentElements[0].getAttribute('aria-label'), 'Remove attachment: Plan');
	assert.ok(f.composer.attachmentElements[0].classList.contains('opencode-composer-chip'));

	f.composer.setText('Typed text');
	click(f.composer.attachmentElements[0]);
	assert.equal(f.composer.attachmentElements.length, 1, 'Removing a chip drops only that item');
	assert.equal(f.composer.text, 'Typed text', 'Removing a chip leaves the typed text unchanged');
	assert.deepEqual(f.composer.listAttachments().map((attachment) => attachment.kind), ['selection']);
});

test('chips survive an uncertain send and clear on confirmed admission, including retry recovery', () => {
	const f = fixture();
	const sent = [note('Plan.md')];
	f.composer.addAttachment(sent[0]);
	f.composer.update(state({ id: 'p', text: 'lost', phase: 'uncertain' }));
	assert.equal(f.composer.attachmentElements.length, 1, 'An uncertain send keeps its chips for recovery');

	// The viewed message is not cleared while uncertain, so the retry still owns these chips.
	assert.equal(f.composer.text, '');
	f.composer.update(state({ id: 'p', text: 'lost', phase: 'admitted' }));
	f.composer.clearAttachmentsIf(sent);
	assert.equal(f.composer.attachmentElements.length, 0, 'Confirmed admission clears the sent chips');

	const fresh = fixture();
	fresh.composer.addAttachment(sent[0]);
	fresh.composer.addAttachment(selection('added later'));
	fresh.composer.clearAttachmentsIf(sent);
	assert.equal(fresh.composer.attachmentElements.length, 2,
		'A chip added after the send is not cleared by the older send result');
});
