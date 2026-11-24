import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { installDom } from './dom-helper.mjs';

installDom();
const rendered = [];
class Component {
	cleanups = [];
	children = new Set();
	register(callback) { this.cleanups.push(callback); }
	addChild(child) { this.children.add(child); return child; }
	removeChild(child) { child.unload(); this.children.delete(child); }
	unload() {
		for (const child of this.children) child.unload();
		this.children.clear();
		for (const cleanup of this.cleanups.splice(0)) cleanup();
	}
}
const obsidian = {
	Component,
	Keymap: {
		isModEvent(event) {
			const modifier = event.metaKey || event.ctrlKey;
			if (modifier && event.altKey && event.shiftKey) return 'window';
			if (modifier && event.altKey) return 'split';
			if (modifier || event.button === 1) return 'tab';
			return false;
		},
	},
	MarkdownRenderer: {
		async render(_app, markdown, el) {
			rendered.push(markdown);
			const paragraph = document.createElement('p');
			paragraph.textContent = markdown;
			el.appendChild(paragraph);
		},
	},
};
const bundle = await build({ entryPoints: ['src/ui/markdown.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { MarkdownBlock, splitInternalLink, decideInternalLink, attachLinkRouter, UNRESOLVED_LINK, CONTEXTLESS_LINK } = module.exports;
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function timerFixture() {
	let handle = 0;
	const jobs = new Map();
	return {
		timer: {
			set(callback, delay) { const id = ++handle; jobs.set(id, { callback, delay }); return id; },
			clear(id) { jobs.delete(id); },
		},
		jobs,
		run() { const [id, job] = [...jobs][0]; jobs.delete(id); job.callback(); },
	};
}

test('split hrefs preserve headings, blocks, paths, and contextless references', () => {
	assert.deepEqual(splitInternalLink('Notes/Example'), { linkpath: 'Notes/Example', subpath: '' });
	assert.deepEqual(splitInternalLink('Example#Details'), { linkpath: 'Example', subpath: '#Details' });
	assert.deepEqual(splitInternalLink('Example#^block-id'), { linkpath: 'Example', subpath: '#^block-id' });
	assert.deepEqual(splitInternalLink('#Heading'), { linkpath: '', subpath: '#Heading' });
});

test('link routing resolves against stable source context and rejects unresolved targets', () => {
	const calls = [];
	const env = { resolve: (linkpath, sourcePath) => {
		calls.push([linkpath, sourcePath]);
		return ['Notes/Example', 'Example', 'Duplicate'].includes(linkpath) ? { path: `${linkpath}.md` } : null;
	} };
	assert.deepEqual(decideInternalLink('Notes/Example|Display', '', env), { kind: 'open', href: 'Notes/Example' });
	assert.deepEqual(decideInternalLink('Example#Details', '', env), { kind: 'open', href: 'Example#Details' });
	assert.deepEqual(decideInternalLink('Example#^block-id', '', env), { kind: 'open', href: 'Example#^block-id' });
	assert.equal(decideInternalLink('Duplicate', '', env).kind, 'open', 'Obsidian decides duplicate basenames');
	assert.deepEqual(decideInternalLink('Missing', '', env), { kind: 'unresolved', message: UNRESOLVED_LINK });
	assert.deepEqual(decideInternalLink('#Heading', '', env), { kind: 'unresolved', message: CONTEXTLESS_LINK });
	assert.deepEqual(calls.slice(0, 2), [['Notes/Example', ''], ['Example', '']]);
});

test('internal anchor clicks are intercepted before MarkdownRenderer and forward the pointer pane type', () => {
	const root = document.createElement('div');
	const opened = [];
	const notified = [];
	const groups = [];
	const events = [];
	const environment = {
		resolve: (linkpath) => linkpath === 'Note' ? { path: 'Note.md' } : null,
		open: (href, sourcePath, paneType) => {
			opened.push([href, sourcePath, paneType]);
			if (paneType === 'split') groups.push(href);
		},
		notify: (message) => notified.push(message),
	};
	attachLinkRouter(root, '', environment, { registerDomEvent: (_el, event, callback) => events.push([event, callback]) });
	const anchor = document.createElement('a');
	anchor.className = 'internal-link';
	anchor.setAttribute('data-href', 'Note#Heading');
	root.appendChild(anchor);
	let prevented = false;
	let stopped = false;
	const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
	click.preventDefault = () => { prevented = true; };
	click.stopPropagation = () => { stopped = true; };
	const handler = events.find(([event]) => event === 'click')[1];
	const originalTarget = click.target;
	Object.defineProperty(click, 'target', { value: anchor });
	handler(click);
	assert.equal(prevented, true);
	assert.equal(stopped, true);
	assert.deepEqual(opened, [['Note#Heading', '', false]], 'A plain click forwards no pane type');
	assert.deepEqual(notified, []);
	assert.deepEqual(groups, [], 'A plain click never creates the note group');

	const modifierClicks = [
		['tab', { ctrlKey: true }],
		['tab', { button: 1 }],
		['split', { ctrlKey: true, altKey: true }],
		['window', { ctrlKey: true, altKey: true, shiftKey: true }],
	];
	for (const [paneType, init] of modifierClicks) {
		const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...init });
		Object.defineProperty(event, 'target', { value: anchor });
		handler(event);
		assert.deepEqual(opened.at(-1), ['Note#Heading', '', paneType]);
	}
	assert.deepEqual(groups, ['Note#Heading'], 'Only the split modifier reaches the note group');

	const missing = document.createElement('a');
	missing.className = 'internal-link';
	missing.setAttribute('data-href', 'Missing');
	root.appendChild(missing);
	const openedBeforeUnresolved = opened.length;
	const missingClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, altKey: true });
	Object.defineProperty(missingClick, 'target', { value: missing });
	handler(missingClick);
	assert.deepEqual(notified, [UNRESOLVED_LINK]);
	assert.equal(opened.length, openedBeforeUnresolved, 'An unresolved click never opens');
	assert.deepEqual(groups, ['Note#Heading'], 'An unresolved click never creates the note group');

	const contextless = document.createElement('a');
	contextless.className = 'internal-link';
	contextless.setAttribute('data-href', '#Heading');
	root.appendChild(contextless);
	const contextlessClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, altKey: true });
	Object.defineProperty(contextlessClick, 'target', { value: contextless });
	handler(contextlessClick);
	assert.deepEqual(notified, [UNRESOLVED_LINK, CONTEXTLESS_LINK]);
	assert.equal(opened.length, openedBeforeUnresolved, 'A contextless click never opens');
	assert.deepEqual(groups, ['Note#Heading'], 'A contextless click never creates the note group');
	assert.equal(originalTarget, null);
});

test('rendered lists take the host bullet markup and leave other lists alone', async () => {
	const original = obsidian.MarkdownRenderer.render;
	obsidian.MarkdownRenderer.render = async (_app, _markdown, el) => {
		const nestedItem = document.createElement('li');
		nestedItem.textContent = 'Nested';
		const nested = document.createElement('ul');
		nested.appendChild(nestedItem);
		const first = document.createElement('li');
		first.textContent = 'One';
		first.appendChild(nested);
		const second = document.createElement('li');
		second.textContent = 'Two';
		const list = document.createElement('ul');
		list.append(first, second);

		const orderedItem = document.createElement('li');
		orderedItem.textContent = 'First';
		const ordered = document.createElement('ol');
		ordered.appendChild(orderedItem);

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = true;
		const taskItem = document.createElement('li');
		taskItem.className = 'task-list-item';
		taskItem.append(checkbox, document.createTextNode(' Done'));
		const tasks = document.createElement('ul');
		tasks.className = 'contains-task-list';
		tasks.appendChild(taskItem);

		el.append(list, ordered, tasks);
	};
	const parent = new Component();
	const root = document.createElement('div');
	const clock = timerFixture();
	const block = new MarkdownBlock({ app: {}, component: parent, sourcePath: '' }, root, clock.timer);
	try {
		block.set('# lists', true);
		await tick();
		const lists = root.querySelectorAll('ul');
		assert.ok(lists[0].classList.contains('has-list-bullet'), 'A bullet list takes the host class');
		assert.deepEqual([...lists[0].children].map((item) => item.firstElementChild?.className),
			['list-bullet', 'list-bullet'], 'Each top-level item starts with the host bullet span');
		assert.ok(lists[1].classList.contains('has-list-bullet'), 'A nested list gets its own class');
		assert.equal(lists[1].firstElementChild?.firstElementChild?.className, 'list-bullet');
		const ordered = root.querySelector('ol');
		assert.equal(ordered.className, '', 'Ordered lists keep their numbers');
		assert.equal(ordered.querySelector('.list-bullet'), null);
		const tasks = root.querySelector('.contains-task-list');
		assert.equal(tasks.className, 'contains-task-list', 'Task lists keep their own markup');
		assert.equal(tasks.querySelector('.list-bullet'), null);
		assert.ok(tasks.querySelector('.task-list-item input[type="checkbox"]'), 'Task checkboxes survive');

		block.set('# lists while streaming');
		clock.run();
		await tick();
		assert.ok(root.querySelector('ul.has-list-bullet'),
			'A throttled streaming render takes the host markups too');
	} finally {
		block.dispose();
		obsidian.MarkdownRenderer.render = original;
	}
});

test('markdown renders are batched during streaming and immediate on final text', async () => {
	const clock = timerFixture();
	const parent = new Component();
	const root = document.createElement('div');
	const host = { app: {}, component: parent, sourcePath: '' };
	const block = new MarkdownBlock(host, root, clock.timer);
	const container = root.querySelector('.opencode-markdown');
	assert.ok(container.classList.contains('markdown-rendered'), 'Answers use the native markdown presentation');
	block.set('[[No');
	const pending = [...clock.jobs.keys()][0];
	block.set('[[Note]]');
	assert.equal([...clock.jobs.keys()][0], pending, 'New deltas must not postpone the scheduled render');
	assert.equal(rendered.length, 0);
	clock.run();
	await tick();
	assert.deepEqual(rendered, ['[[Note]]']);
	assert.match(root.textContent, /\[\[Note\]\]/);
	block.set('Final `[[Note]]` and\n\n```md\n[[Example]]\n```', true);
	await tick();
	assert.equal(rendered.length, 2);
	assert.match(rendered[1], /```md/);
	assert.equal(clock.jobs.size, 0);
	block.dispose();
	assert.equal(root.querySelector('.opencode-markdown').childElementCount, 0);
	await tick();
	assert.equal(rendered.length, 2, 'Disposed block must not receive a late render');
});

test('continuous Markdown updates paint intermediate batches before final completion', async () => {
	const clock = timerFixture();
	const block = new MarkdownBlock({ app: {}, component: new Component(), sourcePath: '' },
		document.createElement('div'), clock.timer);
	const start = rendered.length;
	for (const text of ['a', 'ab', 'abc']) block.set(text);
	clock.run();
	await tick();
	assert.equal(rendered[start], 'abc');
	for (const text of ['abcd', 'abcde', 'abcdef']) block.set(text);
	clock.run();
	await tick();
	assert.equal(rendered[start + 1], 'abcdef');
	block.set('latest pending');
	block.set('final', true);
	await tick();
	assert.equal(rendered[start + 2], 'final');
	assert.equal(clock.jobs.size, 0);
	block.dispose();
});

test('repeated replacement unloads previous child lifetimes', async () => {
	const clock = timerFixture();
	const parent = new Component();
	const host = { app: {}, component: parent, sourcePath: '' };
	const block = new MarkdownBlock(host, document.createElement('div'), clock.timer);
	block.set('first', true);
	await tick();
	assert.equal(parent.children.size, 1);
	block.set('second', true);
	await tick();
	assert.equal(parent.children.size, 1);
	const [child] = parent.children;
	block.dispose();
	assert.equal(child.children.size + child.cleanups.length, 0);
});
