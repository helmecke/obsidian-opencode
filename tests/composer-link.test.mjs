import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { installDom } from './dom-helper.mjs';

installDom();
const bundle = await build({ entryPoints: ['src/ui/composer-link.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url), module, module.exports);
const { linkQueryAt, linkInsertText, applyOpenBracket, applyCloseBracket, deleteEmptyPair,
	applyComposerEdit } = module.exports;

test('linkQueryAt reads only the open query after the last unclosed opener', () => {
	assert.equal(linkQueryAt('say [[Note', 10), 'Note', 'A mid-text query is returned');
	assert.equal(linkQueryAt('say [[Note', 6), '', 'The caret right after the opener sees an empty query');
	assert.equal(linkQueryAt('[[a]] and [[b', 13), 'b', 'The last opener wins');
	assert.equal(linkQueryAt('[[a]]', 5), null, 'A closed link has no query');
	assert.equal(linkQueryAt('plain text', 10), null, 'No opener means no query');
	assert.equal(linkQueryAt('', 0), null);
});

test('linkQueryAt treats the injected closing pair as open until the caret passes it', () => {
	assert.equal(linkQueryAt('[[]]', 2), '', 'Caret inside the injected pair keeps the query open');
	assert.equal(linkQueryAt('[[Ex]]', 4), 'Ex');
	assert.equal(linkQueryAt('[[Example]]', 11), null, 'Caret after the closer closes the query');
});

test('linkInsertText keeps unique basenames bare and disambiguates duplicates', () => {
	assert.equal(linkInsertText('Note', 'Notes', true), '[[Note]]');
	assert.equal(linkInsertText('Note', 'Acceptance/Other', false), '[[Acceptance/Other/Note]]');
	assert.equal(linkInsertText('Note', 'Acceptance\\Other', false), '[[Acceptance/Other/Note]]', 'Windows separators normalize');
	assert.equal(linkInsertText('Note', '/Acceptance/', false), '[[Acceptance/Note]]', 'Outer separators are dropped');
	assert.equal(linkInsertText('Note', '', false), '[[Note]]', 'A root-level duplicate cannot be disambiguated further');
});

test('applyOpenBracket inserts a pair or wraps a selection', () => {
	assert.deepEqual(applyOpenBracket({ value: '', selectionStart: 0, selectionEnd: 0 }),
		{ value: '[]', selectionStart: 1, selectionEnd: 1 });
	assert.deepEqual(applyOpenBracket({ value: 'ab', selectionStart: 1, selectionEnd: 1 }),
		{ value: 'a[]b', selectionStart: 2, selectionEnd: 2 }, 'Mid-text pairing keeps the caret between brackets');
	assert.deepEqual(applyOpenBracket({ value: 'abcd', selectionStart: 1, selectionEnd: 3 }),
		{ value: 'a[bc]d', selectionStart: 5, selectionEnd: 5 }, 'A selection is wrapped and the caret moves after the closer');
});

test('applyCloseBracket skips an existing closer or inserts one', () => {
	assert.deepEqual(applyCloseBracket({ value: '[]', selectionStart: 1, selectionEnd: 1 }),
		{ value: '[]', selectionStart: 2, selectionEnd: 2 }, 'The closer is skipped without duplication');
	assert.deepEqual(applyCloseBracket({ value: 'ab', selectionStart: 1, selectionEnd: 1 }),
		{ value: 'a]b', selectionStart: 2, selectionEnd: 2 });
	assert.deepEqual(applyCloseBracket({ value: 'abc', selectionStart: 0, selectionEnd: 2 }),
		{ value: ']c', selectionStart: 1, selectionEnd: 1 }, 'A selection is replaced');
});

test('deleteEmptyPair removes only an empty pair around a collapsed caret', () => {
	assert.deepEqual(deleteEmptyPair({ value: '[]', selectionStart: 1, selectionEnd: 1 }),
		{ value: '', selectionStart: 0, selectionEnd: 0 });
	assert.deepEqual(deleteEmptyPair({ value: 'a[]b', selectionStart: 2, selectionEnd: 2 }),
		{ value: 'ab', selectionStart: 1, selectionEnd: 1 });
	assert.equal(deleteEmptyPair({ value: 'a[b', selectionStart: 2, selectionEnd: 2 }), null);
	assert.equal(deleteEmptyPair({ value: '[]', selectionStart: 0, selectionEnd: 0 }), null);
	assert.equal(deleteEmptyPair({ value: '[]', selectionStart: 0, selectionEnd: 2 }), null, 'A selection is not a collapsed caret');
});

test('applyComposerEdit uses a minimal range replacement and restores the caret', () => {
	const field = document.createElement('textarea');
	field.value = 'abcd';
	field.setSelectionRange(1, 3);
	applyComposerEdit(field, { value: 'a[bc]d', selectionStart: 5, selectionEnd: 5 });
	assert.equal(field.value, 'a[bc]d');
	assert.equal(field.selectionStart, 5);
	assert.equal(field.selectionEnd, 5);
});
