import assert from 'node:assert/strict';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { createObsidian, installDom } from './dom-helper.mjs';

installDom();
const bundle = await build({ entryPoints: ['src/ui/native-controls.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const obsidian = createObsidian({});
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => {
		assert.equal(name, 'obsidian', 'Native controls must only load the Obsidian runtime');
		return obsidian;
	}, module, module.exports);
const { createIconButton, setNativeDisabled } = module.exports;

test('icon buttons use the native clickable-icon surface, icon, and accessible tooltip', () => {
	const root = document.createElement('div');
	const button = createIconButton(root, { icon: 'arrow-up', label: 'Send message', className: 'opencode-composer-send' });
	assert.ok(button instanceof HTMLButtonElement);
	assert.equal(root.firstElementChild, button);
	assert.ok(button.classList.contains('clickable-icon'));
	assert.ok(button.classList.contains('opencode-composer-icon'));
	assert.ok(button.classList.contains('opencode-composer-send'));
	assert.equal(button.querySelectorAll('.lucide-arrow-up').length, 1);
	assert.equal(button.getAttribute('aria-label'), 'Send message');
	assert.equal(button.title, '', 'The host tooltip supplies the name instead of a title');

	const placed = createIconButton(root, { icon: 'refresh-cw', label: 'Retry discovery', placement: 'top' });
	assert.equal(placed.getAttribute('data-tooltip-position'), 'top');
});

test('native disabled state keeps the button attribute and clickable-icon look in sync', () => {
	const button = createIconButton(document.createElement('div'), { icon: 'square', label: 'Stop execution' });
	assert.equal(button.disabled, false);
	assert.equal(button.getAttribute('aria-disabled'), 'false');
	setNativeDisabled(button, true);
	assert.equal(button.disabled, true);
	assert.equal(button.getAttribute('aria-disabled'), 'true');
	setNativeDisabled(button, false);
	assert.equal(button.disabled, false);
	assert.equal(button.getAttribute('aria-disabled'), 'false');
});
