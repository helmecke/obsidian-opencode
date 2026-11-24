import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { createObsidian, installDom } from './dom-helper.mjs';

installDom();

const bundle = await build({
	stdin: { contents: `export * from './src/ui/session-switcher'; export * from './src/opencode/sessions';`,
		resolveDir: process.cwd(), loader: 'ts' },
	bundle: true, format: 'cjs', platform: 'node', external: ['obsidian'], write: false,
});
const module = { exports: {} };
const obsidian = createObsidian({});
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { SessionCoordinator, SessionSwitcherModal, relativeTime } = module.exports;

const root = 'C:\\Vault';
const session = (id, updated, directory = root, title = id) => ({
	id, title, location: { directory }, time: { created: updated, updated },
});
const message = (id, text) => ({ id, type: 'user', time: { created: 1 }, text });
const wait = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };

function fixture() {
	const controller = new AbortController();
	const calls = [];
	const records = new Map([
		['old', session('old', 1000, root, 'Older')],
		['new', session('new', 2000, root, 'Newest')],
		['child', { ...session('child', 2500, root, 'Delegated task'), parentID: 'new' }],
		['grandchild', { ...session('grandchild', 2600, root, 'Nested task'), parentID: 'child' }],
		['foreign', session('foreign', 3000, 'C:\\Other', 'Other vault')],
	]);
	const client = {
		session: {
			list: async (input) => { calls.push(['list', input]); return { data: [...records.values()], cursor: {} }; },
			get: async ({ sessionID }) => records.get(sessionID),
		},
		message: { list: async ({ sessionID }) => { calls.push(['messages', sessionID]);
			return { data: [message(`${sessionID}-message`, `${sessionID} transcript`)], cursor: {} }; } },
	};
	const coordinator = new SessionCoordinator({ signal: controller.signal, connect: async () => client }, () => root);
	return { coordinator, calls };
}

test('the switcher lists fresh current-vault top-level sessions newest first and marks the current one', async () => {
	const f = fixture();
	const switcher = new SessionSwitcherModal({}, () => f.coordinator.list(), () => 'new',
		(id) => f.coordinator.select(id));
	switcher.open();
	await wait();
	assert.equal(f.calls.filter((call) => call[0] === 'list').length, 1, 'Opening requests a fresh list');
	assert.deepEqual(switcher.getItems().map((item) => item.id), ['new', 'old'],
		'Newest first, foreign vault and delegated subagent sessions excluded');

	const current = document.createElement('div');
	switcher.renderSuggestion({ item: switcher.getItems()[0], match: { score: 0, matches: [] } }, current);
	assert.ok(current.classList.contains('is-current'));
	assert.match(current.textContent, /Newest/);
	assert.match(current.textContent, /Current/);
	const other = document.createElement('div');
	switcher.renderSuggestion({ item: switcher.getItems()[1], match: { score: 0, matches: [] } }, other);
	assert.equal(other.classList.contains('is-current'), false);
});

test('choosing a session selects it through the session coordinator', async () => {
	const f = fixture();
	await f.coordinator.list();
	f.calls.length = 0;
	const switcher = new SessionSwitcherModal({}, () => f.coordinator.list(), () => f.coordinator.selectedID,
		(id) => f.coordinator.select(id));
	switcher.open();
	await wait();
	switcher.onChooseItem(switcher.getItems().find((item) => item.id === 'old'));
	await wait();
	assert.equal(f.coordinator.selectedID, 'old');
	assert.deepEqual(f.calls.find((call) => call[0] === 'messages'), ['messages', 'old']);
	assert.equal(switcher.isOpen, false);
});

test('closing the switcher without choosing leaves the selection unchanged', async () => {
	const f = fixture();
	await f.coordinator.select('new');
	const switcher = new SessionSwitcherModal({}, () => f.coordinator.list(), () => f.coordinator.selectedID,
		(id) => f.coordinator.select(id));
	switcher.open();
	await wait();
	switcher.close();
	await wait();
	assert.equal(f.coordinator.selectedID, 'new');
});

test('relative update times stay compact', () => {
	const now = Date.now();
	assert.equal(relativeTime(now, now), 'just now');
	assert.equal(relativeTime(now - 5 * 60 * 1000, now), '5 min ago');
	assert.equal(relativeTime(now - 3 * 60 * 60 * 1000, now), '3 h ago');
	assert.equal(relativeTime(now - 2 * 24 * 60 * 60 * 1000, now), '2 d ago');
});
