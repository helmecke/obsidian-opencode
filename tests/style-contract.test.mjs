import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

function ruleBody(selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = new RegExp(`^${escaped} \\{$`, 'm').exec(css);
	assert.notEqual(match, null, `styles.css declares ${selector}`);
	const open = match.index + match[0].length - 1;
	const close = css.indexOf('}', open);
	assert.notEqual(close, -1, `${selector} has a closed block`);
	return css.slice(open + 1, close);
}

test('the chat view root keeps layout only and stops restating the pane', () => {
	const root = ruleBody('.opencode-chat');
	for (const declaration of ['color:', 'background-color:', 'font-size:']) {
		assert.ok(!root.includes(declaration),
			`The view root does not declare ${declaration} over Obsidian's view content`);
	}
	assert.match(root, /display: flex/);
	assert.match(root, /padding: 0/, 'The reading surface owns the padding, not the view root');
});

test('the transcript defers typography and margins to the reading view', () => {
	const messages = ruleBody('.opencode-chat-messages');
	assert.ok(!/\bpadding/.test(messages),
		'The host reading-view padding supplies the note margins');
	assert.match(messages, /height: auto/,
		'The host height does not overflow the composer column');
	assert.match(messages, /flex: 1/);
	assert.match(messages, /overflow-y: auto/);
});

test('prose seams use the theme paragraph rhythm without spacing a tool run', () => {
	const prose = ruleBody('.opencode-chat-messages .opencode-part-text + .opencode-part-text');
	assert.match(prose, /margin-top: var\(--p-spacing\)/);
});

test('a tool or reasoning group uses the same step, with tight rows', () => {
	const band = ruleBody('.opencode-chat-messages .opencode-part-text + :is(.opencode-part-tool, .opencode-part-reasoning),\n.opencode-chat-messages :is(.opencode-part-tool, .opencode-part-reasoning) + .opencode-part-text');
	assert.match(band, /margin-top: var\(--p-spacing\)/);
	assert.match(css, /nth-last-child\(1 of \.opencode-part\)/,
		'A group edge keeps its gap when a message split lands on it');
	assert.ok(!/\.opencode-part-tool \+ \.opencode-part-tool|:is\(\.opencode-part-tool, \.opencode-part-reasoning\) \+ :is\(\.opencode-part-tool, \.opencode-part-reasoning\)/.test(css),
		'Rows inside one group get no margin of their own');
});

test('both sides of a prompt use the same spacing step as prose', () => {
	assert.match(ruleBody('.opencode-message-user:not(:first-child)'), /margin-top: var\(--p-spacing\)/,
		'Space above a prompt');
	assert.match(ruleBody('.opencode-chat-messages .opencode-message-user + .opencode-message-assistant'),
		/margin-top: var\(--p-spacing\)/, 'Space below a prompt');
	assert.ok(!/--opencode-(turn|detail)-gap/.test(css),
		'The plugin keeps no spacing token of its own');
});

test('the reading measure uses the theme note margin as its floor', () => {
	const setting = ruleBody('.opencode-chat.is-readable-line-width');
	assert.match(setting, /--file-margins-x/);
	assert.match(setting, /--file-line-width/);
	assert.match(ruleBody('.opencode-chat-composer'), /var\(--file-margins-x\)/,
		'The composer shares the transcript measure');
});
