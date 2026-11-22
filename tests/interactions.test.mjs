import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, installDom } from './dom-helper.mjs';

installDom();
const bundle = await build({ entryPoints: ['src/ui/interactions.ts'], bundle: true,
	format: 'cjs', platform: 'node', write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url), module, module.exports);
const { defaultValues, isFieldVisible, validateForm, safeExternalUrl, renderPermissionCard, FormCard, ToolEntryView,
	toolStatus } = module.exports;

const field = (key, type, extra = {}) => ({ key, type, title: key, ...extra });
const container = () => document.createElement('div');
const input = (element, value, event = 'input') => {
	element.value = value;
	element.dispatchEvent(new window.Event(event, { bubbles: true }));
};

test('visibility conditions and hidden required fields do not block submission', () => {
	const fields = [
		field('kind', 'string', { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
		field('detail', 'string', { required: true, when: [{ key: 'kind', op: 'eq', value: 'b' }] }),
		field('secret', 'string', { required: true, hidden: true }),
	];
	const values = { kind: 'a' };
	assert.equal(isFieldVisible(fields[1], values), false);
	assert.equal(isFieldVisible(fields[1], { kind: 'b' }), true);
	const validation = validateForm(fields, values);
	assert.deepEqual(validation.errors, {});
	assert.deepEqual(validation.answer, { kind: 'a' });
});

test('defaults, every supported field type, and numeric/multiselect validation', () => {
	const fields = [
		field('text', 'string', { default: 'hello', minLength: 2, maxLength: 10 }),
		field('choice', 'string', { options: [{ value: 'one', label: 'One' }], required: true }),
		field('number', 'number', { minimum: 1, maximum: 10 }),
		field('integer', 'integer', { minimum: 0 }),
		field('boolean', 'boolean', { default: true }),
		field('many', 'multiselect', { options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], minItems: 1 }),
		field('link', 'external', { url: 'https://example.com' }),
	];
	const values = { ...defaultValues(fields), choice: 'one', number: 2.5, integer: 2, many: ['x'] };
	const validation = validateForm(fields, values);
	assert.deepEqual(validation.errors, {});
	assert.deepEqual(validation.answer, { text: 'hello', choice: 'one', number: 2.5, integer: 2, boolean: true, many: ['x'] });
	assert.equal(validateForm(fields, { ...values, integer: 1.5 }).errors.integer, 'Enter a whole number.');
	assert.equal(validateForm(fields, { ...values, number: 20 }).errors.number, 'Enter a value of at most 10.');
	assert.equal(validateForm(fields, { ...values, many: [] }).errors.many, 'Choose at least 1 options.');
	assert.equal(validateForm(fields, { ...values, many: ['x', 'z'] }).errors.many, 'Choose only the listed options.');
});

test('format, length, pattern, required, and unsupported fields fail closed', () => {
	const fields = [
		field('email', 'string', { format: 'email', required: true }),
		field('date', 'string', { format: 'date' }),
		field('url', 'string', { format: 'uri' }),
		field('code', 'string', { pattern: '^[a-z]+$' }),
		field('short', 'string', { minLength: 3 }),
	];
	const valid = validateForm(fields, { email: 'a@example.com', date: '2026-11-22', url: 'https://example.com', code: 'abc', short: 'abcd' });
	assert.deepEqual(valid.errors, {});
	assert.equal(validateForm(fields, { email: 'nope', date: '22.11.2026', url: 'javascript:alert(1)', code: 'ABC', short: 'a' }).errors.email,
		'Enter a valid email address.');
	const unsupported = validateForm([field('future', 'rating'), field('ok', 'string')], { ok: 'fine' });
	assert.deepEqual(unsupported.unsupported, ['future']);
	assert.deepEqual(unsupported.answer, {});
});

test('safe external URLs reject scripts and relative schemes', () => {
	assert.equal(safeExternalUrl('https://example.com/a'), 'https://example.com/a');
	assert.equal(safeExternalUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080/');
	assert.equal(safeExternalUrl('javascript:alert(1)'), undefined);
	assert.equal(safeExternalUrl('file:///etc/passwd'), undefined);
	assert.equal(safeExternalUrl('/relative'), undefined);
});

test('permission card exposes explicit once/always/reject with persistent scope', () => {
	const decisions = [];
	const root = container();
	renderPermissionCard(root, { id: 'p', sessionID: 's', action: 'Run shell', resources: ['C:\\vault'],
		save: ['C:\\vault'], message: 'Review the command.' }, { decide: (decision) => decisions.push(decision) });
	assert.match(root.textContent, /Run shell/);
	assert.match(root.textContent, /Persistent approval/);
	const buttons = [...root.querySelectorAll('button')];
	assert.deepEqual(buttons.map((button) => button.textContent), ['Allow once', 'Always allow', 'Reject']);
	click(buttons[0]); click(buttons[1]); click(buttons[2]);
	assert.deepEqual(decisions, ['once', 'always', 'reject']);

	const noSave = container();
	renderPermissionCard(noSave, { id: 'p', sessionID: 's', action: 'Read', resources: [] },
		{ decide: () => assert.fail('No decision expected') });
	assert.equal(noSave.querySelector('button:nth-child(2)').disabled, true);
	click(noSave.querySelector('button:nth-child(2)'));
});

test('form card renders choices, text, toggles, multiselect, and external link without auto-opening', () => {
	const answers = [];
	const opened = [];
	const root = container();
	let cancelled = 0;
	const form = {
		id: 'f', sessionID: 's', title: 'Configure',
		fields: [
			field('choice', 'string', { required: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
			field('text', 'string', { required: true }),
			field('more', 'string', { required: true, when: [{ key: 'choice', op: 'eq', value: 'b' }] }),
			field('enabled', 'boolean'),
			field('many', 'multiselect', { options: [{ value: 'x', label: 'X' }] }),
			field('link', 'external', { url: 'https://example.com/docs', title: 'Docs' }),
		],
	};
	const card = new FormCard(root, form, {
		submit: (answer) => answers.push(answer), cancel: () => cancelled++,
		openExternal: (url) => opened.push(url),
	});
	card.update(form, false);
	const select = root.querySelector('select');
	input(select, 'b', 'change');
	const inputs = root.querySelectorAll('input[type="text"]');
	input(inputs[0], 'value');
	input(inputs[1], 'conditional');
	const checkbox = root.querySelector('input[type="checkbox"]');
	checkbox.checked = true;
	checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
	const option = [...root.querySelectorAll('input[type="checkbox"]')][1];
	option.checked = true;
	option.dispatchEvent(new window.Event('change', { bubbles: true }));
	click(root.querySelector('.opencode-form-actions button'));
	assert.deepEqual(answers, [{ choice: 'b', text: 'value', more: 'conditional', enabled: true, many: ['x'] }]);
	assert.deepEqual(opened, [], 'External links must not open until clicked');
	click(root.querySelector('a'));
	assert.deepEqual(opened, ['https://example.com/docs']);
	click([...root.querySelectorAll('.opencode-form-actions button')][1]);
	assert.equal(cancelled, 1);
});

test('form card keeps hidden required fields from blocking and reports unsupported fields', () => {
	const root = container();
	const form = { id: 'f', sessionID: 's', title: 'Question', fields: [
		field('kind', 'string', { options: [{ value: 'a', label: 'A' }] }),
		field('hiddenRequired', 'string', { required: true, hidden: true }),
	] };
	const answers = [];
	new FormCard(root, form, { submit: (answer) => answers.push(answer), cancel: () => {}, openExternal: () => {} });
	click(root.querySelector('.opencode-form-actions button'));
	assert.deepEqual(answers, [{}], 'Hidden required fields do not block an otherwise empty form');

	const unsupportedRoot = container();
	const unsupported = { id: 'u', sessionID: 's', title: 'Future', fields: [field('rating', 'rating')] };
	new FormCard(unsupportedRoot, unsupported, { submit: () => assert.fail('Unsupported form must not submit'), cancel: () => {}, openExternal: () => {} });
	assert.match(unsupportedRoot.textContent, /unsupported fields \(rating\)/);
	assert.equal(unsupportedRoot.querySelector('.opencode-form-actions button').disabled, true);
});

test('tool entries distinguish progress, success, and failure and never evaluate output HTML', () => {
	const root = container();
	const view = new ToolEntryView(root);
	const base = { type: 'tool', id: 't', name: 'read', time: { created: 1 } };
	view.update({ ...base, state: { status: 'running', input: { path: 'a' }, metadata: {} } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Running');
	view.update({ ...base, state: { status: 'completed', input: { path: 'a' },
		content: [{ type: 'text', text: '<img src=x onerror="globalThis.pwned=true">' }] } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Done');
	assert.equal(root.querySelectorAll('img').length, 0);
	assert.match(root.textContent, /<img src=x/);
	view.update({ ...base, state: { status: 'error', input: { path: 'a' },
		error: { type: 'unknown', message: 'failed safely' } } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Failed');
	assert.match(root.textContent, /failed safely/);
	assert.equal(toolStatus({ state: { status: 'streaming', input: '' } }).label, 'Preparing');
	view.dispose();
	assert.equal(root.childElementCount, 0);
});
