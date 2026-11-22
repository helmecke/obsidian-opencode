import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { installDom } from './dom-helper.mjs';

installDom();
class AbstractInputSuggest {
	constructor(app, textInputEl) {
		this.app = app;
		this.textInputEl = textInputEl;
		this.limit = 100;
		this.closed = false;
		this.scope = {
			handlers: [],
			register(modifiers, key, callback) {
				const handler = { modifiers, key, callback };
				this.handlers.push(handler);
				return handler;
			},
			unregister(handler) {
				const index = this.handlers.indexOf(handler);
				if (index >= 0) this.handlers.splice(index, 1);
			},
		};
	}
	close() { this.closed = true; }
}
const obsidian = {
	AbstractInputSuggest,
	prepareFuzzySearch(query) {
		const needle = query.toLowerCase();
		return (text) => {
			const index = text.toLowerCase().indexOf(needle);
			return index < 0 ? null : { score: 100 - index, matches: [] };
		};
	},
	sortSearchResults(results) {
		results.sort((left, right) => right.match.score - left.match.score);
	},
};
const bundle = await build({ entryPoints: ['src/ui/note-link-suggest.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { NoteLinkSuggest } = module.exports;

const files = [
	{ basename: 'Alone', path: 'Alone.md', parent: { path: '' } },
	{ basename: 'Example', path: 'Notes/Example.md', parent: { path: 'Notes' } },
	{ basename: 'Example', path: 'Other/Example.md', parent: { path: 'Other' } },
];
const app = { vault: { getMarkdownFiles: () => files } };

function inputAt(value, caret) {
	const element = document.createElement('input');
	element.value = value;
	element.setSelectionRange(caret, caret);
	document.body.appendChild(element);
	let events = 0;
	element.addEventListener('input', () => { events++; });
	return { element, count: () => events };
}

function makeSuggest(value, caret, onSend = () => {}) {
	const input = inputAt(value, caret);
	return { suggest: new NoteLinkSuggest(app, input.element, onSend), input };
}

test('no suggestions without an unclosed opener', () => {
	const { suggest } = makeSuggest('plain text', 10);
	assert.deepEqual(suggest.getSuggestions('plain text'), []);
	const closed = makeSuggest('[[a]]', 5);
	assert.deepEqual(closed.suggest.getSuggestions('[[a]]'), []);
});

test('an empty query lists vault notes by path and keeps only markdown files', () => {
	const { suggest } = makeSuggest('[[]]', 2);
	const results = suggest.getSuggestions('');
	assert.deepEqual(results.map((file) => file.path), ['Alone.md', 'Notes/Example.md', 'Other/Example.md']);
	assert.equal(results.every((file) => file.path.endsWith('.md')), true);
});

test('the open query filters and ranks markdown notes', () => {
	const { suggest } = makeSuggest('[[Ex', 4);
	assert.deepEqual(suggest.getSuggestions('Ex').map((file) => file.path),
		['Notes/Example.md', 'Other/Example.md']);
	const none = makeSuggest('[[zzz', 5);
	assert.deepEqual(none.suggest.getSuggestions('zzz'), []);
});

test('a unique basename inserts a bare link, replaces the span and dispatches input', () => {
	const { suggest, input } = makeSuggest('[[]]', 2);
	suggest.selectSuggestion(files[0], {});
	assert.equal(input.element.value, '[[Alone]]');
	assert.equal(input.element.selectionStart, 9);
	assert.equal(input.count(), 1, 'Programmatic insertion dispatches an input event');
	assert.equal(suggest.closed, true, 'Selection closes the popover');
});

test('a duplicate basename inserts the vault-relative path and reuses the paired closer', () => {
	const { suggest, input } = makeSuggest('[[Ex]]', 4);
	suggest.selectSuggestion(files[1], {});
	assert.equal(input.element.value, '[[Notes/Example]]', 'The existing closer is replaced, not duplicated');
	assert.equal(input.element.selectionStart, 17);
	assert.deepEqual(suggest.getSuggestions(''), [], 'The query is closed, so the popover cannot reopen');
});

test('selection without a closing pair still adds one', () => {
	const { suggest, input } = makeSuggest('say [[Ex', 9);
	suggest.selectSuggestion(files[2], {});
	assert.equal(input.element.value, 'say [[Other/Example]]');
});

test('rows render the basename with its folder path underneath', () => {
	const { suggest } = makeSuggest('[[]]', 2);
	const element = document.createElement('div');
	suggest.renderSuggestion(files[1], element);
	assert.equal(element.classList.contains('opencode-note-suggestion'), true);
	assert.equal(element.querySelector('.opencode-note-suggestion-name').textContent, 'Example');
	assert.equal(element.querySelector('.opencode-note-suggestion-path').textContent, 'Notes/');

	const root = document.createElement('div');
	suggest.renderSuggestion(files[0], root);
	assert.equal(root.querySelector('.opencode-note-suggestion-path').textContent, '/');
});

test('Mod+Enter sends from the active suggest scope and dispose unregisters it', () => {
	const sent = [];
	const { suggest, input } = makeSuggest('[[]]', 2, () => sent.push(input.element.value));
	const handler = suggest.scope.handlers.find((entry) => entry.key === 'Enter');
	assert.deepEqual(handler.modifiers, ['Mod']);
	input.element.focus();
	assert.equal(handler.callback({ repeat: false }), false, 'The shortcut is consumed after sending');
	assert.deepEqual(sent, ['[[]]']);
	assert.equal(suggest.closed, true);
	suggest.dispose();
	assert.equal(suggest.scope.handlers.length, 0, 'Unload unregisters the shortcut');
});
