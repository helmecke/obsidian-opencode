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
	open() { this.closed = false; }
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
const bundle = await build({ entryPoints: ['src/ui/composer-suggest.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { ComposerSuggest } = module.exports;

const files = [
	{ basename: 'Alone', path: 'Alone.md', parent: { path: '' } },
	{ basename: 'Example', path: 'Notes/Example.md', parent: { path: 'Notes' } },
	{ basename: 'Example', path: 'Other/Example.md', parent: { path: 'Other' } },
];
const app = { vault: { getMarkdownFiles: () => files } };
const skills = [
	{ id: 'skill-build', name: 'build', path: 'C:/skills/build.md', content: 'Build content' },
	{ id: 'skill-apply', name: 'apply', description: 'Apply a change', path: 'C:/skills/apply.md', content: 'Apply content' },
	{ id: 'skill-archive', name: 'archive', description: 'Archive a change', path: 'C:/skills/archive.md', content: 'Archive content' },
];
const commands = [
	{ name: 'review', description: 'Review the working tree' },
	{ name: 'team/review' },
	{ name: 'test' },
];

function inputAt(value, caret) {
	const element = document.createElement('input');
	element.value = value;
	element.setSelectionRange(caret, caret);
	document.body.appendChild(element);
	let events = 0;
	element.addEventListener('input', () => { events++; });
	return { element, count: () => events };
}

function makeSuggest(value, caret, options = {}) {
	const input = inputAt(value, caret);
	const calls = [];
	const catalog = options.catalog ?? {
		async loadSkills() { calls.push('skills'); },
		getSkills: () => options.skills ?? skills,
		async loadCommands() { calls.push('commands'); },
		getCommands: () => options.commands ?? commands,
	};
	const sent = [];
	const suggest = new ComposerSuggest(app, input.element, catalog, () => sent.push(input.element.value));
	return { suggest, input, calls, sent };
}

function label(entry) {
	if (entry.kind === 'skill') return `skill:${entry.skill.name}`;
	if (entry.kind === 'command') return `command:${entry.command.name}`;
	return `note:${entry.file.path}`;
}
const names = (entries) => entries.map(label);

test('no suggestions without an unclosed note or skill trigger', async () => {
	const { suggest } = makeSuggest('plain text', 10);
	assert.deepEqual(await suggest.getSuggestions('plain text'), []);
	const closed = makeSuggest('[[a]]', 5);
	assert.deepEqual(await closed.suggest.getSuggestions('[[a]]'), []);
	const midWord = makeSuggest('word$app', 8);
	assert.deepEqual(await midWord.suggest.getSuggestions('word$app'), []);
});

test('an empty note query lists vault notes by path and keeps only markdown files', async () => {
	const { suggest } = makeSuggest('[[]]', 2);
	const results = await suggest.getSuggestions('');
	assert.deepEqual(names(results), ['note:Alone.md', 'note:Notes/Example.md', 'note:Other/Example.md']);
});

test('the open note query filters and ranks markdown notes', async () => {
	const { suggest } = makeSuggest('[[Ex', 4);
	assert.deepEqual(names(await suggest.getSuggestions('Ex')),
		['note:Notes/Example.md', 'note:Other/Example.md']);
	const none = makeSuggest('[[zzz', 5);
	assert.deepEqual(await none.suggest.getSuggestions('zzz'), []);
});

test('a unique note basename inserts a bare link, replaces the span and dispatches input', () => {
	const { suggest, input } = makeSuggest('[[]]', 2);
	suggest.selectSuggestion({ kind: 'note', file: files[0] }, {});
	assert.equal(input.element.value, '[[Alone]]');
	assert.equal(input.element.selectionStart, 9);
	assert.equal(input.count(), 1, 'Programmatic insertion dispatches an input event');
	assert.equal(suggest.closed, true, 'Selection closes the popover');
});

test('a duplicate note basename inserts the vault-relative path and reuses the paired closer', async () => {
	const { suggest, input } = makeSuggest('[[Ex]]', 4);
	suggest.selectSuggestion({ kind: 'note', file: files[1] }, {});
	assert.equal(input.element.value, '[[Notes/Example]]', 'The existing closer is replaced, not duplicated');
	assert.equal(input.element.selectionStart, 17);
	assert.deepEqual(await suggest.getSuggestions(''), [], 'The query is closed, so the popover cannot reopen');
});

test('note selection without a closing pair still adds one and preserves surrounding text', () => {
	const { suggest, input } = makeSuggest('say [[Ex', 9);
	suggest.selectSuggestion({ kind: 'note', file: files[2] }, {});
	assert.equal(input.element.value, 'say [[Other/Example]]');
});

test('note rows render the basename with its folder path underneath', () => {
	const { suggest } = makeSuggest('[[]]', 2);
	const element = document.createElement('div');
	suggest.renderSuggestion({ kind: 'note', file: files[1] }, element);
	assert.equal(element.classList.contains('opencode-note-suggestion'), true);
	assert.equal(element.querySelector('.opencode-note-suggestion-name').textContent, 'Example');
	assert.equal(element.querySelector('.opencode-note-suggestion-path').textContent, 'Notes/');

	const root = document.createElement('div');
	suggest.renderSuggestion({ kind: 'note', file: files[0] }, root);
	assert.equal(root.querySelector('.opencode-note-suggestion-path').textContent, '/');
});

test('a leading slash opens commands without loading skills and lists names in order', async () => {
	const { suggest, calls } = makeSuggest('/', 1);
	assert.deepEqual(names(await suggest.getSuggestions('')), ['command:review', 'command:team/review', 'command:test']);
	assert.deepEqual(calls, ['commands'], 'Only the command catalog is requested');
	const partial = makeSuggest('/re', 3);
	assert.deepEqual(names(await partial.suggest.getSuggestions('re')), ['command:review', 'command:team/review']);
	assert.deepEqual(partial.calls, ['commands']);
	const nested = makeSuggest('/team/rev', 9);
	assert.deepEqual(names(await nested.suggest.getSuggestions('team/rev')), ['command:team/review']);
});

test('the command trigger needs the message start and a caret in the first token', async () => {
	for (const [value, caret] of [['see /review', 11], ['and/or', 6], ['/review src', 11],
		['/review', 0], ['/rev iew', 8]]) {
		const { suggest, calls } = makeSuggest(value, caret);
		assert.deepEqual(await suggest.getSuggestions(value), [], value);
		assert.deepEqual(calls, [], `${value} does not request the catalog`);
	}
});

test('commands win over skills when both could match, and notes still win over commands', async () => {
	const command = makeSuggest('/$app', 5);
	assert.deepEqual(await command.suggest.getSuggestions('$app'), []);
	assert.deepEqual(command.calls, ['commands'], 'A leading slash never loads the skill catalog');
	const note = makeSuggest('[[/$app', 7);
	await note.suggest.getSuggestions('/$app');
	assert.deepEqual(note.calls, [], 'A note link wins over a command trigger');
});

test('command queries rank by fuzzy name and show no rows without a match', async () => {
	const { suggest } = makeSuggest('/t', 2);
	assert.deepEqual(names(await suggest.getSuggestions('t')), ['command:team/review', 'command:test'],
		'Both matching commands remain');
	const none = makeSuggest('/zzz', 4);
	assert.deepEqual(await none.suggest.getSuggestions('zzz'), []);
});

test('command rows show the invoked name and an optional description', async () => {
	const { suggest } = makeSuggest('/', 1);
	const withDescription = document.createElement('div');
	suggest.renderSuggestion({ kind: 'command', command: commands[0] }, withDescription);
	assert.equal(withDescription.classList.contains('opencode-command-suggestion'), true);
	assert.equal(withDescription.querySelector('.opencode-command-suggestion-name').textContent, '/review');
	assert.equal(withDescription.querySelector('.opencode-command-suggestion-description').textContent,
		'Review the working tree');

	const without = document.createElement('div');
	suggest.renderSuggestion({ kind: 'command', command: commands[1] }, without);
	assert.equal(without.querySelector('.opencode-command-suggestion-name').textContent, '/team/review');
	assert.equal(without.querySelector('.opencode-command-suggestion-description'), null);
});

test('selecting a command inserts /name with a trailing space and never sends', () => {
	for (const key of ['Enter', 'Tab', 'ArrowRight']) {
		const { suggest, input, sent } = makeSuggest('/rev', 4);
		suggest.selectSuggestion({ kind: 'command', command: commands[0] }, { key });
		assert.equal(input.element.value, '/review ', key);
		assert.equal(input.element.selectionStart, 8, key);
		assert.equal(input.count(), 1, key);
		assert.equal(suggest.closed, true, key);
		assert.deepEqual(sent, [], 'Selection does not send the message');
	}
	const nested = makeSuggest('/team/r', 7);
	nested.suggest.selectSuggestion({ kind: 'command', command: commands[1] }, {});
	assert.equal(nested.input.element.value, '/team/review ');
	assert.equal(nested.input.element.selectionStart, 13);
});

test('command insertion preserves text after the caret and Escape or blur leaves it unchanged', async () => {
	const { suggest, input } = makeSuggest('/rev and more', 4);
	suggest.selectSuggestion({ kind: 'command', command: commands[0] }, {});
	assert.equal(input.element.value, '/review  and more');
	assert.equal(input.element.selectionStart, 8);

	const dismissed = makeSuggest('/rev', 4);
	dismissed.suggest.close();
	assert.equal(dismissed.suggest.closed, true);
	assert.equal(dismissed.input.element.value, '/rev');
	assert.deepEqual(dismissed.sent, []);
	assert.deepEqual(names(await dismissed.suggest.getSuggestions('rev')),
		['command:review', 'command:team/review']);
});

test('the suggest reports its own openness and dispose closes it', () => {
	const { suggest } = makeSuggest('[[]]', 2);
	assert.equal(suggest.isCompletionOpen(), false, 'A fresh popover owns no keys');
	suggest.open();
	assert.equal(suggest.isCompletionOpen(), true);
	suggest.close();
	assert.equal(suggest.isCompletionOpen(), false);
	suggest.open();
	suggest.dispose();
	assert.equal(suggest.isCompletionOpen(), false, 'Dispose closes the popover');
});

test('Mod+Enter sends from an open command scope and dispose unregisters it', () => {
	const { suggest, input, sent } = makeSuggest('/rev', 4);
	const handler = suggest.scope.handlers.find((entry) => entry.key === 'Enter');
	assert.deepEqual(handler.modifiers, ['Mod']);
	input.element.focus();
	assert.equal(handler.callback({ repeat: false }), false, 'The shortcut is consumed after sending');
	assert.deepEqual(sent, ['/rev']);
	assert.equal(suggest.closed, true);
	suggest.dispose();
	assert.equal(suggest.scope.handlers.length, 0);
});

test('skill triggers load the catalog and list skills by name for an empty query', async () => {
	const { suggest, calls } = makeSuggest('$', 1);
	assert.deepEqual(names(await suggest.getSuggestions('')), ['skill:apply', 'skill:archive', 'skill:build']);
	assert.deepEqual(calls, ['skills'], 'The skill loader is awaited when a $ query is present');
	const plain = makeSuggest('plain', 5);
	await plain.suggest.getSuggestions('plain');
	assert.deepEqual(plain.calls, [], 'No catalog request without a trigger');
	const note = makeSuggest('[[$app', 6);
	await note.suggest.getSuggestions('$app');
	assert.deepEqual(note.calls, [], 'A note link wins over a skill mention');
});

test('skill queries filter by fuzzy name match and show no rows when nothing matches', async () => {
	const { suggest } = makeSuggest('say $ap', 7);
	assert.deepEqual(names(await suggest.getSuggestions('ap')), ['skill:apply']);
	const none = makeSuggest('$zzz', 4);
	assert.deepEqual(await none.suggest.getSuggestions('zzz'), []);
});

test('skill rows render the name and an optional description', async () => {
	const { suggest } = makeSuggest('$', 1);
	const withDescription = document.createElement('div');
	suggest.renderSuggestion({ kind: 'skill', skill: skills[1] }, withDescription);
	assert.equal(withDescription.classList.contains('opencode-skill-suggestion'), true);
	assert.equal(withDescription.querySelector('.opencode-skill-suggestion-name').textContent, 'apply');
	assert.equal(withDescription.querySelector('.opencode-skill-suggestion-description').textContent, 'Apply a change');

	const without = document.createElement('div');
	suggest.renderSuggestion({ kind: 'skill', skill: skills[0] }, without);
	assert.equal(without.querySelector('.opencode-skill-suggestion-name').textContent, 'build');
	assert.equal(without.querySelector('.opencode-skill-suggestion-description'), null);
});

test('selecting a skill inserts $name with a trailing space and never sends', () => {
	for (const key of ['Enter', 'Tab', 'ArrowRight']) {
		const { suggest, input, sent } = makeSuggest('say $ap', 7);
		suggest.selectSuggestion({ kind: 'skill', skill: skills[1] }, { key });
		assert.equal(input.element.value, 'say $apply ', key);
		assert.equal(input.element.selectionStart, 11, key);
		assert.equal(input.count(), 1, key);
		assert.equal(suggest.closed, true, key);
		assert.deepEqual(sent, [], 'Selection does not send the message');
	}
});

test('skill insertion preserves text after the caret', () => {
	const { suggest, input } = makeSuggest('say $ap and more', 7);
	suggest.selectSuggestion({ kind: 'skill', skill: skills[1] }, {});
	assert.equal(input.element.value, 'say $apply  and more');
	assert.equal(input.element.selectionStart, 11);
});

test('dismissal closes the popover and leaves the composer text unchanged', () => {
	const { suggest, input, sent } = makeSuggest('$ap', 3);
	suggest.close();
	assert.equal(suggest.closed, true);
	assert.equal(input.element.value, '$ap');
	assert.deepEqual(sent, []);
});

test('Mod+Enter sends from the active suggest scope and dispose unregisters it', () => {
	const { suggest, input, sent } = makeSuggest('[[]]', 2);
	const handler = suggest.scope.handlers.find((entry) => entry.key === 'Enter');
	assert.deepEqual(handler.modifiers, ['Mod']);
	input.element.focus();
	assert.equal(handler.callback({ repeat: false }), false, 'The shortcut is consumed after sending');
	assert.deepEqual(sent, ['[[]]']);
	assert.equal(suggest.closed, true);
	suggest.dispose();
	assert.equal(suggest.scope.handlers.length, 0, 'Unload unregisters the shortcut');
});
