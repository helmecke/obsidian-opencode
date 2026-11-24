import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { installDom } from './dom-helper.mjs';

installDom();
class MarkdownView {
	constructor(file) { this.file = file; }
}
const obsidian = {
	Component: class Component {},
	MarkdownRenderer: { async render() {} },
	MarkdownView,
};
const bundle = await build({ entryPoints: ['src/ui/link-stack.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { LinkStack, reservedNoteLeaf } = module.exports;

const target = (path) => ({ path });

function createLeaf(root, parent, opened = []) {
	const leaf = {
		parent,
		view: {},
		opened,
		getRoot: () => root,
		getViewState: () => ({ type: 'empty', state: {} }),
		openFile: (file, openState) => {
			opened.push([file, openState]);
			leaf.view = new MarkdownView(file);
			leaf.getViewState = () => ({ type: 'markdown', state: { file: file.path } });
			return Promise.resolve();
		},
	};
	return leaf;
}

/** A workspace with a live root split, one chat leaf, and the public group API. */
function fixture(options = {}) {
	const root = { children: [] };
	const calls = { split: [], parent: [] };
	const addParent = () => {
		const parent = { children: [] };
		root.children.push(parent);
		return parent;
	};
	const addLeaf = (parent, view) => {
		const leaf = createLeaf(root, parent);
		if (view) leaf.view = view;
		parent.children.push(leaf);
		return leaf;
	};
	const addChat = () => addLeaf(addParent());
	const addNote = (file) => addLeaf(addParent(), new MarkdownView(target(file)));
	const addDeferred = (file) => {
		const leaf = addLeaf(addParent());
		leaf.getViewState = () => ({ type: 'markdown', state: { file } });
		return leaf;
	};
	const chatLeaf = addChat();
	const workspace = {
		rootSplit: root,
		createLeafBySplit(leaf, direction) {
			calls.split.push([leaf, direction]);
			return addLeaf(addParent());
		},
		createLeafInParent(parent, index) {
			calls.parent.push([parent, index]);
			const groupLeaf = createLeaf(root, parent);
			parent.children.splice(index, 0, groupLeaf);
			return groupLeaf;
		},
	};
	const vault = options.getConfig ? { getConfig: options.getConfig } : {};
	const app = {
		workspace,
		vault,
		metadataCache: {
			getFirstLinkpathDest(linkpath) {
				return linkpath ? target(linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`) : null;
			},
		},
	};
	const group = () => root.children.at(-1).children[0];
	return { app, root, chatLeaf, addChat, addLeaf, addNote, addDeferred, calls, group };
}

test('first use creates a note group to the right of the chat', () => {
	const f = fixture();
	const stack = new LinkStack(f.app, f.chatLeaf);
	stack.open('Acceptance/Example#Details', '');
	assert.deepEqual(f.calls.split, [[f.chatLeaf, 'vertical']], 'The group splits vertically, which is to the right');
	assert.equal(f.calls.parent.length, 0);
	const group = f.group();
	assert.deepEqual(group.opened, [[target('Acceptance/Example.md'), { active: true, eState: { subpath: '#Details' } }]]);
});

test('later clicks append a tab to the same group', () => {
	const f = fixture();
	const stack = new LinkStack(f.app, f.chatLeaf);
	stack.open('One', '');
	stack.open('Two', '');
	assert.equal(f.calls.split.length, 1, 'Only the first click creates the group');
	assert.equal(f.calls.parent.length, 1, 'The second click appends');
	const parent = f.calls.parent[0][0];
	assert.equal(parent, f.root.children.at(-1), 'Appending stays in the group, not the chat tabs');
	assert.equal(f.calls.parent[0][1], 1, 'The new tab is appended after the existing one');
	assert.equal(parent.children.length, 2);
	assert.deepEqual(parent.children[1].opened, [[target('Two.md'), { active: true }]]);
});

test('a note already in the group is focused with its heading or block subpath', () => {
	const f = fixture();
	const stack = new LinkStack(f.app, f.chatLeaf);
	stack.open('Example', '');
	const existing = f.group();
	existing.opened.length = 0;
	stack.open('Example#^block-id', '');
	assert.equal(f.calls.split.length, 1);
	assert.equal(f.calls.parent.length, 0, 'A duplicate is not appended');
	assert.equal(f.group().parent.children.length, 1, 'A duplicate is not added as another tab');
	assert.deepEqual(existing.opened, [[target('Example.md'), { active: true, eState: { subpath: '#^block-id' } }]]);
});

test('a closed group is recreated on the next click', () => {
	const f = fixture();
	const stack = new LinkStack(f.app, f.chatLeaf);
	stack.open('One', '');
	const closed = f.root.children.at(-1);
	f.root.children.splice(f.root.children.indexOf(closed), 1);
	stack.open('Two', '');
	assert.equal(f.calls.split.length, 2, 'A closed group is not reused');
	assert.equal(f.calls.parent.length, 0);
	assert.deepEqual(f.group().opened, [[target('Two.md'), { active: true }]]);
});

test('each chat tab owns its own group', () => {
	const f = fixture();
	const first = new LinkStack(f.app, f.chatLeaf);
	const second = new LinkStack(f.app, f.addChat());
	first.open('One', '');
	second.open('Two', '');
	assert.equal(f.calls.split.length, 2, 'Two chat tabs create two groups');
	const groups = f.root.children.filter((parent) => parent.children[0]?.opened.length);
	assert.equal(groups.length, 2);
	assert.deepEqual(groups[0].children[0].opened[0][0], target('One.md'));
	assert.deepEqual(groups[1].children[0].opened[0][0], target('Two.md'));
});

test('focus follows the app preference with a focus fallback', () => {
	const assertActive = (getConfig, expected) => {
		const f = fixture(getConfig ? { getConfig } : {});
		new LinkStack(f.app, f.chatLeaf).open('Example', '');
		assert.equal(f.group().opened[0][1].active, expected);
	};
	assertActive(undefined, true);
	assertActive(() => true, true);
	assertActive(() => false, false);
	assertActive(() => { throw new Error('unreadable'); }, true);
});

test('plain and new-tab opens reserve a note tab outside the chat group', () => {
	const f = fixture();
	f.addLeaf(f.chatLeaf.parent, new MarkdownView(target('Chat group.md')));
	const note = f.addNote('Notes/Example.md');
	assert.equal(reservedNoteLeaf(f.app.workspace, f.chatLeaf), note);
});

test('deferred note tabs are reserved', () => {
	const f = fixture();
	const deferred = f.addDeferred('Deferred.md');
	assert.equal(reservedNoteLeaf(f.app.workspace, f.chatLeaf), deferred);
});

test('a plain click reuses a note tab that shares the chat group', () => {
	const f = fixture();
	const note = f.addLeaf(f.chatLeaf.parent, new MarkdownView(target('Chat group.md')));
	assert.equal(reservedNoteLeaf(f.app.workspace, f.chatLeaf), note,
		'The existing note tab is navigated instead of creating a split');
});

test('an outside note tab is preferred over one in the chat group', () => {
	const f = fixture();
	f.addLeaf(f.chatLeaf.parent, new MarkdownView(target('Chat group.md')));
	const outside = f.addNote('Notes/Example.md');
	assert.equal(reservedNoteLeaf(f.app.workspace, f.chatLeaf), outside);
});

test('no note tab yields no target so the caller opens a split', () => {
	const f = fixture();
	assert.equal(reservedNoteLeaf(f.app.workspace, f.chatLeaf), undefined);
});
