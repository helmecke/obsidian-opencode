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
	applyComposerEdit, skillQueryAt, skillMentions, skillMentionEdit,
	commandQueryAt, commandInsertEdit } = module.exports;

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

test('skillQueryAt opens at the input start or after whitespace only', () => {
	assert.deepEqual(skillQueryAt('$', 1), { query: '', start: 0 }, 'The caret follows the trigger');
	assert.deepEqual(skillQueryAt('$app', 4), { query: 'app', start: 0 });
	assert.deepEqual(skillQueryAt('say $ap', 7), { query: 'ap', start: 4 });
	assert.deepEqual(skillQueryAt('say\t$ap', 7), { query: 'ap', start: 4 }, 'Tabs are whitespace boundaries');
	assert.equal(skillQueryAt('$app', 0), null, 'The caret must follow the trigger');
});

test('skillQueryAt rejects mid-word triggers and queries with whitespace or newlines', () => {
	assert.equal(skillQueryAt('word$', 5), null);
	assert.equal(skillQueryAt('wo$rd', 3), null);
	assert.equal(skillQueryAt('$skill name', 11), null, 'The caret sits in a later word');
	assert.deepEqual(skillQueryAt('$skill name', 6), { query: 'skill', start: 0 }, 'The query stays open until whitespace');
	assert.equal(skillQueryAt('$a\nb', 4), null, 'A newline separates the caret from the trigger');
	assert.equal(skillQueryAt('$a$b', 4), null, 'A second dollar is not a skill name');
});

test('skillMentions extracts only boundary-aligned $name tokens', () => {
	assert.deepEqual(skillMentions('use $apply and $build ').map((entry) => entry.name), ['apply', 'build']);
	assert.deepEqual(skillMentions('$apply and $apply'), [
		{ name: 'apply', start: 0, end: 6 },
		{ name: 'apply', start: 11, end: 17 },
	]);
	assert.deepEqual(skillMentions('word$no $ yes $ok'), [{ name: 'ok', start: 14, end: 17 }]);
	assert.deepEqual(skillMentions('no mentions here'), []);
});

test('skillMentionEdit replaces the query, appends a space, and preserves trailing text', () => {
	assert.deepEqual(skillMentionEdit({ value: '$app', selectionStart: 4, selectionEnd: 4 }, 'apply'),
		{ value: '$apply ', selectionStart: 7, selectionEnd: 7 });
	assert.deepEqual(skillMentionEdit({ value: 'say $ap and more', selectionStart: 7, selectionEnd: 7 }, 'apply'),
		{ value: 'say $apply  and more', selectionStart: 11, selectionEnd: 11 }, 'Text after the caret remains');
	assert.equal(skillMentionEdit({ value: 'word$no', selectionStart: 7, selectionEnd: 7 }, 'apply'), null);
});

test('commandQueryAt opens only for a leading slash with the caret in the first token', () => {
	assert.deepEqual(commandQueryAt('/', 1), { query: '', start: 0 }, 'The caret follows the trigger');
	assert.deepEqual(commandQueryAt('/rev', 4), { query: 'rev', start: 0 });
	assert.deepEqual(commandQueryAt('/team/rev', 9), { query: 'team/rev', start: 0 }, 'Nested names keep their slash');
	assert.equal(commandQueryAt('/review src', 11), null, 'A caret in the arguments has no query');
	assert.equal(commandQueryAt('see /review', 11), null, 'A slash after text does not trigger');
	assert.equal(commandQueryAt('and/or', 6), null, 'A slash inside a word does not trigger');
	assert.equal(commandQueryAt('/review', 0), null, 'The caret must follow the leading slash');
	assert.equal(commandQueryAt('/rev iew', 8), null, 'Whitespace closes the command token');
	assert.equal(commandQueryAt('', 0), null);
});

test('commandInsertEdit replaces the leading query and appends a trailing space', () => {
	assert.deepEqual(commandInsertEdit({ value: '/rev', selectionStart: 4, selectionEnd: 4 }, 'review'),
		{ value: '/review ', selectionStart: 8, selectionEnd: 8 });
	assert.deepEqual(commandInsertEdit({ value: '/', selectionStart: 1, selectionEnd: 1 }, 'review'),
		{ value: '/review ', selectionStart: 8, selectionEnd: 8 });
	assert.deepEqual(commandInsertEdit({ value: '/team/r', selectionStart: 7, selectionEnd: 7 }, 'team/review'),
		{ value: '/team/review ', selectionStart: 13, selectionEnd: 13 }, 'Nested names insert unchanged');
	assert.deepEqual(commandInsertEdit({ value: '/rev and more', selectionStart: 4, selectionEnd: 4 }, 'review'),
		{ value: '/review  and more', selectionStart: 8, selectionEnd: 8 }, 'Text after the caret remains');
	assert.equal(commandInsertEdit({ value: 'see /rev', selectionStart: 8, selectionEnd: 8 }, 'review'), null);
	assert.equal(commandInsertEdit({ value: '/review src', selectionStart: 11, selectionEnd: 11 }, 'review'), null);
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
