import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: ['src/settings.ts'], bundle: true, format: 'cjs',
	platform: 'node', external: ['obsidian'], write: false,
});

const controls = [];

class Setting {
	constructor(containerEl) { this.containerEl = containerEl; controls.push(this); }
	setName(name) { this.name = name; return this; }
	setDesc(description) { this.description = description; return this; }
	addText(callback) {
		const control = {
			placeholder: undefined,
			value: undefined,
			change: undefined,
			setPlaceholder(value) { control.placeholder = value; return control; },
			setValue(value) { control.value = value; return control; },
			onChange(change) { control.change = change; return control; },
		};
		callback(control);
		this.text = control;
		return this;
	}
	addToggle(callback) {
		const control = {
			value: undefined,
			change: undefined,
			setValue(value) { control.value = value; return control; },
			onChange(change) { control.change = change; return control; },
		};
		callback(control);
		this.toggle = control;
		return this;
	}
}

class PluginSettingTab {
	constructor(app, plugin) { this.app = app; this.plugin = plugin; }
}

const module = { exports: {} };
const require = createRequire(import.meta.url);
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => {
		if (name !== 'obsidian') return require(name);
		return { PluginSettingTab, Setting };
	}, module, module.exports,
);
const { loadSettings, OpenCodeSettingTab } = module.exports;

function displayTab(settings, save, onChange) {
	controls.length = 0;
	const tab = new OpenCodeSettingTab({}, {}, settings, save, onChange);
	tab.containerEl = { empty() {} };
	tab.display();
	return tab;
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

test('settings tab shows Show reasoning unchecked, updates the setting, and saves before notifying', async () => {
	const settings = loadSettings(undefined);
	const saved = [];
	let notify = 0;
	let release;
	const gate = new Promise((resolve) => { release = resolve; });
	const tab = displayTab(settings, async () => {
		await gate;
		saved.push({ ...settings });
	}, () => {
		assert.equal(saved.length, notify + 1, 'The change callback runs after its save resolves');
		notify++;
	});
	void tab;

	assert.deepEqual(controls.map((control) => control.name), [
		'OpenCode 2 executable path', 'Start OpenCode automatically', 'Show reasoning',
		'Attach active note automatically',
	], 'The existing rows keep their order');
	assert.equal(controls[0].text.value, '');
	assert.equal(controls[1].toggle.value, true);
	assert.match(controls[1].description, /shared service is always reused/);

	const row = controls[2];
	assert.ok(row.toggle, 'The row is a toggle');
	assert.equal(row.toggle.value, false, 'Reasoning starts hidden');
	assert.match(row.description, /Hidden by default/);

	const attachRow = controls[3];
	assert.ok(attachRow.toggle, 'The attachment preference is a toggle');
	assert.equal(attachRow.toggle.value, false, 'The active note is not attached automatically by default');
	assert.match(attachRow.description, /Off by default/);
	assert.match(attachRow.description, /never attached while this is off/);

	const pending = row.toggle.change(true);
	assert.equal(settings.showReasoning, true, 'The toggle mutates the settings object');
	assert.equal(saved.length, 0);
	assert.equal(notify, 0);
	release();
	await pending;
	assert.equal(saved.length, 1);
	assert.equal(saved[0].showReasoning, true);
	assert.equal(notify, 1);

	await row.toggle.change(false);
	assert.equal(settings.showReasoning, false);
	assert.equal(saved.at(-1).showReasoning, false);
	assert.equal(notify, 2);

	await attachRow.toggle.change(true);
	assert.equal(settings.attachActiveNote, true, 'The attachment toggle mutates the settings object');
	assert.equal(saved.at(-1).attachActiveNote, true, 'The preference round-trips through save');
	assert.equal(notify, 3, 'Open chats re-render after the preference changes');
});
