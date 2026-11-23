import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, createObsidian, installDom } from './dom-helper.mjs';

installDom();
const bundle = await build({ entryPoints: ['src/ui/interactions.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
const obsidian = createObsidian({});
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
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
	const callout = root.querySelector('.callout');
	assert.ok(callout, 'The permission request uses native callout markup');
	assert.equal(callout.getAttribute('data-callout'), 'warning');
	assert.ok(callout.querySelector('.callout-title .callout-icon .lucide-alert-triangle'));
	assert.equal(callout.querySelector('.callout-title-inner').textContent, 'Permission required');
	const content = callout.querySelector('.callout-content');
	assert.ok(content.querySelector('.opencode-permission-action').textContent.includes('Run shell'));
	assert.match(content.textContent, /Review the command\./);
	assert.match(content.textContent, /Persistent approval would save access for: C:\\vault/);
	const buttons = [...content.querySelectorAll('button')];
	assert.deepEqual(buttons.map((button) => button.textContent), ['Allow once', 'Always allow', 'Reject']);
	assert.deepEqual(buttons.map((button) => button.disabled), [false, false, false]);
	click(buttons[0]); click(buttons[1]); click(buttons[2]);
	assert.deepEqual(decisions, ['once', 'always', 'reject']);

	const noSave = container();
	renderPermissionCard(noSave, { id: 'p', sessionID: 's', action: 'Read', resources: [] },
		{ decide: () => assert.fail('No decision expected') });
	const always = noSave.querySelector('.callout-content button:nth-child(2)');
	assert.equal(always.disabled, true, 'Always allow is disabled without a persistent scope');
	click(always);
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
	const rows = [...root.querySelectorAll('.setting-item')];
	assert.deepEqual(rows.map((row) => row.querySelector('.setting-item-name').textContent),
		['choice *', 'text *', 'more *', 'enabled', 'many', 'Docs'], 'Fields keep their order in native rows');
	for (const row of rows) {
		assert.ok(row.querySelector('.setting-item-info'));
		assert.ok(row.querySelector('.setting-item-control'));
		assert.equal(row.querySelectorAll('.setting-item-error').length, 1);
	}
	assert.equal(rows[2].hidden, true, 'Conditional rows start hidden');
	assert.equal(rows[2].classList.contains('is-invalid'), false);
	click(root.querySelector('.opencode-form-actions button'));
	assert.equal(rows[0].classList.contains('is-invalid'), true, 'Required rows report field errors natively');
	assert.equal(rows[0].querySelector('.setting-item-error').textContent, 'This field is required.');
	assert.equal(rows[1].querySelector('.setting-item-error').textContent, 'This field is required.');
	const select = root.querySelector('select');
	input(select, 'b', 'change');
	assert.equal(rows[2].hidden, false, 'Conditional rows appear when their condition matches');
	assert.equal(rows[0].classList.contains('is-invalid'), false, 'Correcting a field clears its invalid state');
	const inputs = root.querySelectorAll('input[type="text"]');
	assert.equal(inputs[0].closest('.setting-item'), rows[1], 'Text inputs stay inside their field rows');
	assert.equal(inputs[1].closest('.setting-item'), rows[2]);
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
	card.update(form, true);
	assert.equal(root.querySelector('.opencode-form-actions button').disabled, true, 'Submit is disabled while busy');
	assert.equal([...root.querySelectorAll('.opencode-form-actions button')][1].disabled, true);
	card.update(form, false);
	assert.equal(root.querySelector('.opencode-form-actions button').disabled, false);
	assert.equal([...root.querySelectorAll('.opencode-form-actions button')][1].disabled, false);
});

test('form card keeps hidden required fields from blocking and reports unsupported fields', () => {
	const root = container();
	const form = { id: 'f', sessionID: 's', title: 'Question', fields: [
		field('kind', 'string', { options: [{ value: 'a', label: 'A' }] }),
		field('hiddenRequired', 'string', { required: true, hidden: true }),
	] };
	const answers = [];
	new FormCard(root, form, { submit: (answer) => answers.push(answer), cancel: () => {}, openExternal: () => {} });
	const rows = [...root.querySelectorAll('.setting-item')];
	assert.equal(rows[1].hidden, true, 'Hidden fields hide their whole native row');
	assert.equal(rows[1].querySelector('.setting-item-error').textContent, '');
	click(root.querySelector('.opencode-form-actions button'));
	assert.deepEqual(answers, [{}], 'Hidden required fields do not block an otherwise empty form');
	assert.equal(rows[1].classList.contains('is-invalid'), false, 'Hidden required fields show no field error');

	const unsupportedRoot = container();
	const unsupported = { id: 'u', sessionID: 's', title: 'Future', fields: [field('rating', 'rating')] };
	new FormCard(unsupportedRoot, unsupported, { submit: () => assert.fail('Unsupported form must not submit'), cancel: () => {}, openExternal: () => {} });
	assert.match(unsupportedRoot.textContent, /unsupported fields \(rating\)/);
	assert.equal(unsupportedRoot.querySelector('.opencode-form-actions button').disabled, true);
});

test('tool summaries show an icon, status or duration, and a one-line preview', () => {
	const root = container();
	const view = new ToolEntryView(root);
	const base = { type: 'tool', id: 't', name: 'read', time: { created: 1 } };
	view.update({ ...base, time: { created: 1, ran: 1000, completed: 1400 },
		state: { status: 'completed', input: { path: 'notes/example.md' },
			content: [{ type: 'text', text: '<img src=x onerror="globalThis.pwned=true">' }] } });
	const summary = root.querySelector('summary');
	assert.equal(root.querySelector('.opencode-tool-status').textContent, '0.4s', 'Completed tools show their duration');
	assert.equal(root.querySelector('.opencode-tool-preview').textContent, 'notes/example.md');
	assert.ok(root.querySelector('.opencode-tool-icon .lucide-wrench'), 'The summary carries a muted tool icon');
	assert.ok(root.querySelector('.opencode-tool-icon .opencode-disclosure-chevron .lucide-chevron-right'),
		'The icon gives way to a chevron on hover');
	assert.equal(summary.querySelector('img'), null);
	assert.match(root.textContent, /<img src=x/, 'Result output stays text');
	assert.equal(globalThis.pwned, undefined);

	view.update({ ...base, state: { status: 'running', input: { command: 'npm test' }, metadata: {} } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Running');
	assert.ok(root.querySelector('.opencode-tool-status').classList.contains('is-running'));
	assert.equal(root.querySelector('.opencode-tool-preview').textContent, 'npm test');

	view.update({ ...base, state: { status: 'error', input: { filePath: 'notes/example.md' },
		error: { type: 'unknown', message: 'failed safely' } } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Failed');
	assert.ok(root.querySelector('.opencode-tool-status').classList.contains('is-failed'));
	assert.equal(root.querySelector('.opencode-tool-preview').textContent, 'notes/example.md');
	assert.match(root.textContent, /failed safely/);

	view.update({ ...base, state: { status: 'streaming', input: '{"path":"draft' } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Preparing');
	assert.equal(root.querySelector('.opencode-tool-preview').textContent, '{"path":"draft');
	assert.equal(toolStatus({ state: { status: 'streaming', input: '' } }).label, 'Preparing');
	view.dispose();
	assert.equal(root.childElementCount, 0);
});

test('tool summaries handle missing timestamps, multiline previews, and non-string input', () => {
	const root = container();
	const view = new ToolEntryView(root);
	const base = { type: 'tool', id: 't', name: 'write', time: { created: 1 } };

	view.update({ ...base, state: { status: 'completed', input: { path: 'a.md' }, content: [] } });
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Done',
		'Missing timestamps fall back to the status word');

	view.update({ ...base, time: { created: 1, ran: 1000, completed: 1400 },
		state: { status: 'completed', input: { command: 'line one\nline two\n' + 'x'.repeat(200) }, content: [] } });
	const preview = root.querySelector('.opencode-tool-preview');
	assert.equal(preview.textContent.includes('\n'), false, 'The preview is one line');
	assert.ok(preview.textContent.endsWith('…'), 'A long preview is truncated');
	assert.ok(preview.textContent.length <= 81);
	assert.equal(preview.getAttribute('title'), preview.textContent);

	view.update({ ...base, state: { status: 'running', input: { path: 42, count: 3, nested: { text: 'x' } }, metadata: {} } });
	assert.equal(root.querySelector('.opencode-tool-preview').textContent, '', 'Non-string input has no preview');
	assert.equal(root.querySelector('.opencode-tool-preview').hidden, true);
	assert.equal(root.querySelector('.opencode-tool-status').textContent, 'Running');
});
