import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, createObsidian, installDom } from './dom-helper.mjs';

installDom();

const bundle = await build({ entryPoints: ['src/ui/changed-files.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? createObsidian({}) : createRequire(import.meta.url)(name), module, module.exports);
const { ChangedFilesView, ChangedFilesDisclosure, canOpenFile } = module.exports;

const wait = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
const file = (name, extra = {}) => ({
	file: name, patch: `@@ -1 +1 @@\n-old\n+new`, additions: 1, deletions: 1, status: 'modified', ...extra,
});
const container = () => document.createElement('div');

test('the flat file list shows counts and names every row accessibly', () => {
	const target = container();
	const view = new ChangedFilesView(target);
	view.render([file('Notes/A.md'), file('Notes/B.md', { status: 'deleted', additions: 0, deletions: 4 })]);
	const rows = [...target.querySelectorAll('details.opencode-file')];
	assert.equal(rows.length, 2);
	const summary = rows[0].querySelector('summary');
	assert.equal(summary.tagName, 'SUMMARY', 'The native disclosure toggle is keyboard-reachable');
	assert.equal(summary.parentElement, rows[0]);
	assert.equal(rows[0].querySelector('.opencode-file-name').textContent, 'Notes/A.md');
	assert.equal(rows[0].querySelector('.opencode-file-meta').textContent, 'Modified · +1 −1');
	assert.equal(rows[1].querySelector('.opencode-file-meta').textContent, 'Deleted · +0 −4');
	assert.match(rows[0].querySelector('summary').getAttribute('aria-label'), /Notes\/A\.md, Modified, 1 additions, 1 deletions/);
	assert.equal(target.querySelector('.opencode-changed-files').getAttribute('role'), 'group');
	assert.equal(target.querySelector('.opencode-changed-files').getAttribute('aria-label'), 'Changed files');

	const empty = container();
	new ChangedFilesView(empty).render([]);
	assert.match(empty.querySelector('.opencode-diff-note').textContent, /No file changes/);
});

test('open is enabled only inside the vault and copy writes the full patch', async () => {
	const opened = [];
	const copied = [];
	const target = container();
	const view = new ChangedFilesView(target, {
		open: (entry) => opened.push(entry.file),
		copy: async (patch) => { copied.push(patch); },
	});
	view.render([
		file('Notes/A.md'),
		file('Notes/Gone.md', { status: 'deleted' }),
		file('../Outside.md'),
		file('/tmp/Absolute.md'),
	]);
	const rows = [...target.querySelectorAll('details.opencode-file')];
	const opens = rows.map((row) => row.querySelector('button[aria-label^="Open "]'));
	assert.deepEqual(opens.map((button) => button.disabled), [false, true, true, true]);
	assert.equal(opens[0].getAttribute('aria-disabled'), 'false');
	assert.equal(opens[1].getAttribute('aria-disabled'), 'true');
	assert.equal(opens[1].getAttribute('title'), 'Deleted files cannot be opened.');
	assert.equal(opens[2].getAttribute('title'), 'Files outside the vault cannot be opened.');
	assert.equal(canOpenFile(file('Notes/A.md')), true);
	assert.equal(canOpenFile(file('Notes/A.md', { status: 'deleted' })), false);

	click(opens[0]);
	click(opens[1]);
	assert.deepEqual(opened, ['Notes/A.md'], 'A disabled open action does nothing');

	const copy = rows[0].querySelector('button[aria-label^="Copy patch for "]');
	assert.equal(copy.getAttribute('aria-label'), 'Copy patch for Notes/A.md');
	click(copy);
	await wait();
	assert.equal(copied.length, 1);
	assert.match(copied[0], /@@ -1 \+1 @@/);

	const failing = container();
	const notices = [];
	new ChangedFilesView(failing, {
		copy: async () => { throw new Error('clipboard denied'); },
		notify: (message) => notices.push(message),
	}).render([file('Notes/A.md')]);
	click(failing.querySelector('button[aria-label^="Copy patch for "]'));
	await wait();
	assert.deepEqual(notices, ['Unable to copy the patch.']);
});

test('a file patch renders only when that row expands', () => {
	const target = container();
	new ChangedFilesView(target).render([file('Notes/A.md')]);
	const row = target.querySelector('details.opencode-file');
	const body = row.querySelector('.opencode-file-patch');
	assert.equal(body.childElementCount, 0, 'Collapsed rows do not parse or render');
	row.open = true;
	row.dispatchEvent(new Event('toggle'));
	assert.ok(body.querySelector('.opencode-diff-header'));
	assert.equal(body.querySelectorAll('.opencode-diff-line.is-add').length, 1);
});

test('the turn disclosure fetches only on expansion and names its files while collapsed', async () => {
	const target = container();
	const files = [file('Notes/A.md'), file('Notes/B.md')];
	let calls = 0;
	const load = async () => { calls++; return files; };
	const disclosure = new ChangedFilesDisclosure(target, { load });
	disclosure.update(['Notes/A.md', 'Notes/B.md'], load);
	const summary = disclosure.element.querySelector('summary');
	assert.equal(disclosure.element.open, false, 'The turn disclosure starts collapsed');
	assert.equal(summary.getAttribute('aria-label'), 'Changed files: Notes/A.md, Notes/B.md');
	assert.equal(summary.querySelector('.opencode-changed-files-preview').textContent, 'Notes/A.md, Notes/B.md');
	assert.equal(calls, 0, 'Naming the files performs no request');

	disclosure.element.open = true;
	disclosure.element.dispatchEvent(new Event('toggle'));
	assert.match(disclosure.element.querySelector('.opencode-changed-files-body').textContent, /Loading changes/);
	await wait();
	assert.equal(calls, 1, 'Expansion loads the turn diff');
	assert.equal(disclosure.element.querySelectorAll('details.opencode-file').length, 2);

	disclosure.update(['Notes/A.md', 'Notes/B.md'], load);
	await wait();
	assert.equal(calls, 1, 'A re-render with the same files keeps the loaded list');

	disclosure.update(['Notes/C.md'], load);
	assert.equal(disclosure.element.querySelectorAll('details.opencode-file').length, 0,
		'A changed file list resets the body');
	assert.equal(calls, 2, 'An open disclosure reloads the changed turn');
});

test('a failed turn diff shows a compact error with retry', async () => {
	const target = container();
	let calls = 0;
	const load = async () => {
		calls++;
		if (calls === 1) throw new Error('private transport detail');
		return [file('Notes/A.md')];
	};
	const disclosure = new ChangedFilesDisclosure(target, { load });
	disclosure.update(['Notes/A.md'], load);
	disclosure.element.open = true;
	disclosure.element.dispatchEvent(new Event('toggle'));
	await wait();
	const error = disclosure.element.querySelector('.opencode-diff-error');
	assert.match(error.textContent, /Unable to load changes\./);
	assert.equal(disclosure.element.textContent.includes('private'), false);
	const retry = error.querySelector('button');
	assert.equal(retry.textContent, 'Retry');
	assert.equal(retry.getAttribute('aria-label'), 'Retry loading changes');
	click(retry);
	await wait();
	assert.equal(calls, 2);
	assert.equal(disclosure.element.querySelectorAll('details.opencode-file').length, 1);
	assert.equal(disclosure.element.querySelector('.opencode-diff-error'), null);

	disclosure.dispose();
	assert.equal(target.querySelector('details.opencode-turn-changes'), null);
});
