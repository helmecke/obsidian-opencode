import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: ['src/settings.ts'], bundle: true, format: 'cjs',
	platform: 'node', external: ['obsidian'], write: false,
});

class PluginSettingTab {
	constructor(app, plugin) { this.app = app; this.plugin = plugin; }
}

const module = { exports: {} };
const require = createRequire(import.meta.url);
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => {
		if (name !== 'obsidian') return require(name);
		return { PluginSettingTab };
	}, module, module.exports,
);
const { loadSettings, OpenCodeSettingTab } = module.exports;

function makeTab(settings, save, onChange) {
	return new OpenCodeSettingTab({}, {}, settings, save, onChange);
}

test('reasoning display is opt-in and missing or non-boolean values read as off', () => {
	assert.equal(loadSettings(undefined).showReasoning, false, 'A new install hides reasoning');
	assert.equal(loadSettings({}).showReasoning, false, 'An upgraded install hides reasoning');
	assert.equal(loadSettings({ showReasoning: true }).showReasoning, true);
	for (const value of [false, 'true', 1, 0, null, {}, []]) {
		assert.equal(loadSettings({ showReasoning: value }).showReasoning, false,
			`${JSON.stringify(value)} reads as off`);
	}
});

test('reasoning display does not change the parsing of the other stored fields', () => {
	const managedOrphan = { pid: 42, token: 'abc' };
	assert.deepEqual(loadSettings({
		executablePath: 'C:\\Program Files\\OpenCode\\opencode.exe', autoStart: false,
		showReasoning: true, attachActiveNote: true, managedOrphan,
		selectedSession: { id: 'one', directory: 'C:\\Vault' },
	}), {
		executablePath: 'C:\\Program Files\\OpenCode\\opencode.exe', autoStart: false,
		showReasoning: true, attachActiveNote: true, managedOrphan,
	}, 'Legacy session selection is not persisted');
	assert.deepEqual(loadSettings({
		executablePath: 'bad\npath', autoStart: 'no', showReasoning: 'yes', attachActiveNote: 'yes',
		selectedSession: { id: '', directory: 'C:\\Vault' },
		managedOrphan: { pid: -1, token: 'abc' },
	}), { executablePath: '', autoStart: true, showReasoning: false, attachActiveNote: false },
	'Unknown or invalid values stay out of the stored shape');
});

test('the last selected model is validated and kept for draft defaults', () => {
	assert.deepEqual(loadSettings({ lastModel: { providerID: 'p', id: 'm', variant: 'high' } }).lastModel,
		{ providerID: 'p', id: 'm', variant: 'high' });
	assert.deepEqual(loadSettings({ lastModel: { providerID: 'p', id: 'm', unexpected: 'x' } }).lastModel,
		{ providerID: 'p', id: 'm' });
	for (const lastModel of [undefined, null, {}, { providerID: '', id: 'm' },
		{ providerID: 'p', id: '' }, { providerID: 'p\n', id: 'm' }, { providerID: 'p', id: 'm', variant: 1 }]) {
		assert.equal(loadSettings({ lastModel }).lastModel, undefined,
			`${JSON.stringify(lastModel)} is not persisted`);
	}
});

test('the active-note attachment preference is opt-in and missing values read as off', () => {
	assert.equal(loadSettings(undefined).attachActiveNote, false, 'A new install sends without the active note');
	assert.equal(loadSettings({}).attachActiveNote, false, 'An upgraded install sends without the active note');
	assert.equal(loadSettings({ attachActiveNote: true }).attachActiveNote, true);
	for (const value of [false, 'true', 1, 0, null, {}, []]) {
		assert.equal(loadSettings({ attachActiveNote: value }).attachActiveNote, false,
			`${JSON.stringify(value)} reads as off`);
	}
});

test('settings definitions keep the four rows, their controls, and their order', () => {
	const settings = loadSettings(undefined);
	const tab = makeTab(settings, async () => {}, () => {});
	const definitions = tab.getSettingDefinitions();
	assert.deepEqual(definitions.map((definition) => definition.name), [
		'OpenCode 2 executable path', 'Start OpenCode automatically', 'Show reasoning',
		'Attach active note automatically',
	], 'The existing rows keep their order');
	assert.deepEqual(definitions.map((definition) => definition.control.key), [
		'executablePath', 'autoStart', 'showReasoning', 'attachActiveNote',
	], 'Each row binds to its stored key');
	assert.deepEqual(definitions.map((definition) => definition.control.type), [
		'text', 'toggle', 'toggle', 'toggle',
	]);
	assert.equal(definitions[0].control.placeholder, 'opencode');
	assert.equal(definitions[0].control.validate('bad\npath'),
		'The path cannot contain line breaks or null characters.');
	assert.equal(definitions[0].control.validate('C:\\Program Files\\OpenCode\\opencode.exe'), undefined);
	assert.match(definitions[1].desc, /shared service is always reused/);
	assert.match(definitions[2].desc, /Hidden by default/);
	assert.equal(tab.getControlValue('showReasoning'), false, 'Reasoning starts hidden');
	assert.match(definitions[3].desc, /Off by default/);
	assert.match(definitions[3].desc, /never attached while this is off/);
	assert.equal(tab.getControlValue('attachActiveNote'), false, 'The active note is not attached by default');
});

test('settings updates mutate, save before notifying, and ignore invalid values', async () => {
	const settings = loadSettings(undefined);
	const saved = [];
	let notify = 0;
	let release;
	const gate = new Promise((resolve) => { release = resolve; });
	const tab = makeTab(settings, async () => {
		await gate;
		saved.push({ ...settings });
	}, () => {
		assert.equal(saved.length, notify + 1, 'The change callback runs after its save resolves');
		notify++;
	});

	const pending = tab.setControlValue('showReasoning', true);
	assert.equal(settings.showReasoning, true, 'The change mutates the settings object');
	assert.equal(saved.length, 0);
	assert.equal(notify, 0);
	release();
	await pending;
	assert.equal(saved.length, 1);
	assert.equal(saved[0].showReasoning, true);
	assert.equal(notify, 1);

	await tab.setControlValue('showReasoning', false);
	assert.equal(settings.showReasoning, false);
	assert.equal(saved.at(-1).showReasoning, false);
	assert.equal(notify, 2);

	await tab.setControlValue('attachActiveNote', true);
	assert.equal(settings.attachActiveNote, true, 'The attachment toggle mutates the settings object');
	assert.equal(saved.at(-1).attachActiveNote, true, 'The preference round-trips through save');
	assert.equal(notify, 3, 'Open chats re-render after the preference changes');

	await tab.setControlValue('executablePath', 'bad\npath');
	assert.equal(settings.executablePath, '', 'An invalid path is never stored');
	await tab.setControlValue('autoStart', 'no');
	assert.equal(settings.autoStart, true, 'A non-boolean toggle value is ignored');
	const savedCount = saved.length;
	await tab.setControlValue('unknown', true);
	assert.equal(saved.length, savedCount, 'Unknown keys are not persisted');
});
