import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, installDom } from './dom-helper.mjs';

installDom();

const bundle = await build({ entryPoints: ['src/ui/patch.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	createRequire(import.meta.url), module, module.exports);
const { parsePatch, renderPatch, isBinaryPatch } = module.exports;

const patch = [
	'diff --git a/Notes/A.md b/Notes/A.md',
	'index 111..222 100644',
	'--- a/Notes/A.md',
	'+++ b/Notes/A.md',
	'@@ -1,4 +1,4 @@',
	' unchanged',
	'-old line',
	'+new line',
	' another',
	'\\ No newline at end of file',
].join('\n');

const file = (extra = {}) => ({
	file: 'Notes/A.md', patch, additions: 2, deletions: 1, status: 'modified', ...extra,
});
const container = () => document.createElement('div');

test('the parser classifies hunk headers, additions, removals, context, and metadata', () => {
	assert.deepEqual(parsePatch(''), [], 'Empty input has no rows');
	assert.deepEqual(parsePatch(patch), [
		{ kind: 'meta', text: 'diff --git a/Notes/A.md b/Notes/A.md' },
		{ kind: 'meta', text: 'index 111..222 100644' },
		{ kind: 'meta', text: '--- a/Notes/A.md' },
		{ kind: 'meta', text: '+++ b/Notes/A.md' },
		{ kind: 'hunk', text: '@@ -1,4 +1,4 @@' },
		{ kind: 'context', text: 'unchanged' },
		{ kind: 'remove', text: 'old line' },
		{ kind: 'add', text: 'new line' },
		{ kind: 'context', text: 'another' },
		{ kind: 'meta', text: '\\ No newline at end of file' },
	]);
	assert.deepEqual(parsePatch('+one\r\n-two\r\n'), [
		{ kind: 'add', text: 'one' },
		{ kind: 'remove', text: 'two' },
	], 'CRLF and a trailing newline are normalized');
});

test('a rendered patch has a header with file, status, and counts, and tinted rows', () => {
	const target = container();
	renderPatch(target, file());
	const header = target.querySelector('.opencode-diff-header');
	assert.ok(header);
	assert.equal(header.querySelector('.opencode-diff-name').textContent, 'Notes/A.md');
	assert.equal(header.querySelector('.opencode-diff-status').textContent, 'Modified');
	assert.equal(header.querySelector('.opencode-diff-additions').textContent, '+2');
	assert.equal(header.querySelector('.opencode-diff-deletions').textContent, '−1');
	assert.equal(target.querySelectorAll('.opencode-diff-line.is-add').length, 1);
	assert.equal(target.querySelectorAll('.opencode-diff-line.is-remove').length, 1);
	assert.equal(target.querySelectorAll('.opencode-diff-line.is-context').length, 2);
	assert.equal(target.querySelectorAll('.opencode-diff-line.is-hunk').length, 1);
	assert.equal(target.querySelector('.opencode-diff-line.is-add .opencode-diff-marker').textContent, '+');
	assert.equal(target.querySelector('.opencode-diff-line.is-remove .opencode-diff-marker').textContent, '−');
	assert.equal(target.querySelector('.opencode-diff-line.is-add .opencode-diff-text').textContent, 'new line');

	const long = `+${Array.from({ length: 80 }, () => 'word').join(' ')}`;
	const wrapped = container();
	renderPatch(wrapped, file({ patch: long }));
	assert.equal(wrapped.querySelector('.opencode-diff-text').textContent,
		Array.from({ length: 80 }, () => 'word').join(' '),
		'The full long line reaches one wrapping text node');
});

test('a patch over the cap shows a show-full control that reveals the rest', () => {
	const lines = Array.from({ length: 40 }, (_, index) => `+line ${index}`);
	const target = container();
	renderPatch(target, file({ patch: lines.join('\n') }), { cap: 60 });
	const shown = target.querySelectorAll('.opencode-diff-line').length;
	assert.ok(shown > 0 && shown < 40, 'Only the capped prefix renders');
	assert.match(target.querySelector('.opencode-diff-truncated').textContent, /Showing the first \d+ of 40 lines/);
	const button = target.querySelector('button.opencode-diff-show-full');
	assert.equal(button.textContent, 'Show full patch');
	button.focus();
	click(button);
	assert.equal(target.querySelectorAll('.opencode-diff-line').length, 40, 'The control reveals the full patch');
	assert.equal(target.querySelector('.opencode-diff-show-full'), null, 'The control is gone after expansion');
	assert.equal(target.querySelector('.opencode-diff-truncated'), null);
});

test('partial, empty, and binary patches degrade to labels and notes', () => {
	const partial = container();
	renderPatch(partial, file({ more: true }));
	assert.equal(partial.querySelector('.opencode-diff-partial').textContent, 'Only part of this change is shown.');

	const empty = container();
	renderPatch(empty, file({ patch: '', additions: 0, deletions: 0, status: 'deleted' }));
	assert.equal(empty.querySelector('.opencode-diff-status').textContent, 'Deleted');
	assert.match(empty.querySelector('.opencode-diff-note').textContent, /No text patch is available/);
	assert.equal(empty.querySelector('.opencode-diff-lines'), null);

	const binary = container();
	renderPatch(binary, file({ patch: 'Binary files a/Image.png and b/Image.png differ', status: 'added' }));
	assert.equal(binary.querySelector('.opencode-diff-status').textContent, 'Added');
	assert.match(binary.querySelector('.opencode-diff-note').textContent, /Binary file/);
	assert.equal(binary.querySelector('.opencode-diff-lines'), null);
	assert.equal(isBinaryPatch('GIT binary patch\nliteral 10'), true);
	assert.equal(isBinaryPatch('+++ b/A.md'), false);
});

test('patch text is never interpreted as HTML', () => {
	const target = container();
	renderPatch(target, file({ patch: '+<img src=x onerror="alert(1)">\n+<script>bad()</script>' }));
	assert.equal(target.querySelectorAll('img, script').length, 0);
	assert.match(target.querySelector('.opencode-diff-text').textContent, /<img src=x/);
	assert.equal(target.innerHTML.includes('<img'), false, 'Markup is escaped, never parsed as an element');
});
