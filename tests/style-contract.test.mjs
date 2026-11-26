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

test('a subagent embed is separated from the flow by the paragraph step', () => {
	assert.match(ruleBody('.opencode-message-subagent'), /margin-block: var\(--p-spacing\)/);
});

test('the subagent embed link stays host-owned', () => {
	assert.ok(!/\.markdown-embed-link\s*\{/.test(css),
		'The plugin adds no rule for the host embed link');
	assert.ok(!/--embed-/.test(css),
		'No host embed variable is copied into the plugin styles');
});

test('transcript names and the message field stay off hover tooltips', () => {
	assert.match(ruleBody('.opencode-message[aria-label]'), /--no-tooltip: true/,
		'A message keeps its accessible name without a hover tooltip');
	assert.match(ruleBody('.opencode-message[aria-label] :is(a, button, summary)'),
		/--no-tooltip: false/, 'Controls inside a message keep their own tooltips');
	assert.match(ruleBody('.opencode-composer-card .opencode-chat-input'), /--no-tooltip: true/,
		'The message field keeps its accessible name without a hover tooltip');
});

test('the read-only composer hint is one muted, centered line', () => {
	const hint = ruleBody('.opencode-composer-hint');
	assert.match(hint, /color: var\(--text-muted\)/);
	assert.match(hint, /font-size: var\(--font-ui-smaller\)/);
	const card = ruleBody('.opencode-composer-card.is-readonly');
	assert.match(card, /align-items: center/);
	assert.match(card, /justify-content: center/);
	assert.match(ruleBody('.opencode-composer-card.is-readonly .opencode-composer-hint'),
		/text-align: center/);
	assert.match(ruleBody('.opencode-composer-card.is-readonly .opencode-composer-toolbar'),
		/display: none/);
	assert.match(ruleBody('.opencode-composer-card.is-readonly .opencode-chat-prompt-actions'),
		/display: none/);
});

test('the reading measure uses the theme note margin as its floor', () => {
	const setting = ruleBody('.opencode-chat.is-readable-line-width');
	assert.match(setting, /--file-margins-x/);
	assert.match(setting, /--file-line-width/);
});

test('the composer shares the transcript measure', () => {
	assert.match(ruleBody('.opencode-chat-composer'), /var\(--file-margins-x\)/,
		'The composer shares the transcript measure');
});

test('the composer resolves a ch-based measure in the reading font', () => {
	assert.match(ruleBody('.opencode-chat.is-readable-line-width .opencode-chat-composer'),
		/font-family: var\(--font-text\)/);
	assert.match(ruleBody('.opencode-chat.is-readable-line-width .opencode-chat-composer'),
		/font-size: var\(--font-preferred-size\)/);
	assert.match(ruleBody('.opencode-chat.is-readable-line-width .opencode-composer-card'),
		/font-family: var\(--font-interface\)/, 'The card keeps the interface font');
});

test('the composer reserves the transcript scrollbar gutter', () => {
	const composer = ruleBody('.opencode-chat-composer');
	assert.match(composer, /scrollbar-gutter: stable/,
		'The composer reserves the same gutter as the reading view');
	assert.match(composer, /overflow-y: auto/,
		'The reserved gutter needs a scroll container');
});

test('the diff review tints additions and removals, mutes context, and wraps long lines', () => {
	assert.match(ruleBody('.opencode-diff-line.is-add'), /var\(--color-green\)/);
	assert.match(ruleBody('.opencode-diff-line.is-remove'), /var\(--color-red\)/);
	assert.match(ruleBody('.opencode-diff-line.is-context .opencode-diff-text'), /var\(--text-muted\)/);
	assert.match(ruleBody('.opencode-diff-text'), /white-space: pre-wrap/,
		'Long diff lines wrap instead of scrolling horizontally');
	assert.match(ruleBody('.opencode-diff-text'), /overflow-wrap: anywhere/);
	assert.match(ruleBody('.opencode-diff-lines'), /font-family: var\(--font-monospace\)/);
	assert.match(ruleBody('.opencode-diff-marker'), /flex: 0 0 auto/,
		'The marker column keeps wrapped lines aligned');
	const start = css.indexOf('.opencode-turn-changes');
	const end = css.indexOf('.opencode-diff-error');
	const block = css.slice(start, end);
	assert.ok(!/#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i.test(block),
		'Diff styles use theme colours only, with no hard-coded values');
});
