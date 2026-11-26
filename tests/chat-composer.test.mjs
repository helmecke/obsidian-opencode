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

function fixture() {
	const container = document.createElement('div');
	const composer = new ChatComposer(container, {
		send() {}, retryPrompt() {}, dismissPrompt() {}, setAgent() {}, setModel() {}, stop() {},
	});
	return { composer };
}

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
