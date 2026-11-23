import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { createObsidian, installDom } from './dom-helper.mjs';

installDom();
const bundle = await build({ entryPoints: ['src/ui/conversation.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
const obsidian = createObsidian({});
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { ConversationRenderer } = module.exports;

const container = () => document.createElement('div');
const text = (value) => [{ type: 'text', text: value }];
const reasoning = (value) => ({ type: 'reasoning', text: value });
const user = (id, value) => ({ id, type: 'user', text: value, time: { created: 0 } });
const assistant = (id, content, time, model = { providerID: 'openai', id: 'gpt-5' }, agent = 'build') =>
	({ id, type: 'assistant', agent, model, time, content });

function createMarkdown(parent) {
	const el = parent.createDiv({ cls: 'opencode-markdown markdown-rendered' });
	return {
		set(value) { el.setText(value); },
		dispose() { el.empty(); },
	};
}

function renderer(target, options = {}) {
	return new ConversationRenderer(target, { createMarkdown, ...options });
}

test('entries use a quoted prompt aside with accessible labels and no visible role text', () => {
	const target = container();
	renderer(target).render([
		user('u1', 'Plan the note.\n  Keep indentation.'),
		assistant('a1', text('First answer.'), { created: 1000, completed: 2000 }),
		assistant('a2', text('Second answer.'), { created: 2000, completed: 13400 }),
	]);
	const userEntry = target.querySelector('.opencode-message-user');
	assert.equal(userEntry.getAttribute('role'), 'group');
	assert.equal(userEntry.getAttribute('aria-label'), 'You');
	const quote = userEntry.querySelector('blockquote.opencode-prompt-quote');
	assert.ok(quote, 'The prompt is a native blockquote');
	assert.equal(quote.textContent, 'Plan the note.\n  Keep indentation.');
	assert.ok(userEntry.querySelector('.opencode-prompt.markdown-rendered'), 'The native quote rule is available');
	const userBody = userEntry.querySelector('.opencode-message-body');
	assert.ok(userBody.classList.contains('opencode-message-body'));
	assert.ok(userBody.classList.contains('opencode-message-body-user'));
	assert.equal(target.querySelectorAll('.opencode-message-role').length, 0, 'No visible role elements');
	assert.equal(userEntry.textContent.includes('You'), false);
	assert.equal(target.querySelectorAll('blockquote').length, 1, 'Answers are not quoted');

	const assistantEntries = target.querySelectorAll('.opencode-message-assistant');
	assert.equal(assistantEntries.length, 2);
	assert.equal(assistantEntries[0].getAttribute('aria-label'), 'OpenCode');
	const assistantBody = assistantEntries[0].querySelector('.opencode-message-body');
	assert.ok(assistantBody.classList.contains('opencode-message-body-assistant'));
	assert.equal(assistantEntries[0].textContent.includes('OpenCode'), false);
});

test('reasoning folds look like tool rows with an icon, one-line preview, and chevron affordance', () => {
	const target = container();
	const view = renderer(target);
	view.render([assistant('a1', [reasoning('## Plan\n\n**Check** the `renderer` first.\n\nThen verify.'), ...text('Answer.')],
		{ created: 1000, completed: 2000 })]);
	const details = target.querySelector('details.opencode-reasoning');
	assert.ok(details);
	assert.equal(details.open, false, 'Reasoning starts folded');
	const summary = details.querySelector('summary');
	assert.ok(summary.classList.contains('opencode-disclosure-summary'));
	assert.ok(summary.querySelector('.opencode-disclosure-icon .opencode-disclosure-glyph .lucide-brain'),
		'The summary carries a reasoning icon');
	assert.ok(summary.querySelector('.opencode-disclosure-chevron .lucide-chevron-right'),
		'Hovering can swap the icon for a chevron');
	assert.equal(summary.querySelector('.opencode-reasoning-name').textContent, 'Reasoning');
	assert.equal(summary.querySelector('.opencode-reasoning-preview').textContent,
		'Plan Check the renderer first. Then verify.', 'The preview is one plain line');
	assert.equal(details.querySelector('.opencode-reasoning-body').textContent,
		'## Plan\n\n**Check** the `renderer` first.\n\nThen verify.', 'The full reasoning text stays Markdown');

	view.render([assistant('a1', [reasoning('Updated thoughts.'), ...text('Answer.')],
		{ created: 1000, completed: 2000 })]);
	assert.equal(target.querySelector('.opencode-reasoning-preview').textContent, 'Updated thoughts.',
		'The preview updates in place while streaming');
	view.render([assistant('a1', [reasoning('   '), ...text('Answer.')], { created: 1000, completed: 2000 })]);
	assert.equal(target.querySelector('.opencode-reasoning-preview').hidden, true, 'An empty preview is hidden');
});

test('a pending prompt keeps the quoted shape and its status line', () => {
	const target = container();
	const view = renderer(target);
	view.render([], { id: 'pending-1', phase: 'sending', text: 'Draft\n  prompt' });
	const quote = target.querySelector('blockquote.opencode-prompt-quote');
	assert.equal(quote.textContent, 'Draft\n  prompt');
	assert.equal(target.querySelector('.opencode-prompt-status').textContent, 'Sending…');
	assert.equal(target.querySelector('.opencode-message-user').classList.contains('is-uncertain'), false);

	view.render([], { id: 'pending-1', phase: 'uncertain', text: 'Draft\n  prompt' });
	assert.equal(target.querySelector('.opencode-prompt-status').textContent, 'Not confirmed');
	assert.equal(target.querySelector('.opencode-message-user').classList.contains('is-uncertain'), true);
});

test('routine records stay quiet while failures, shell, compaction, and injected text remain reachable', () => {
	const target = container();
	renderer(target).render([
		{ id: 'idle-ok', type: 'idle', outcome: 'succeeded', time: { created: 1 } },
		{ id: 'agent', type: 'agent-switched', agent: 'build', time: { created: 2 } },
		{ id: 'model', type: 'model-switched', model: { providerID: 'openai', id: 'gpt-5' }, time: { created: 3 } },
		{ id: 'location', type: 'location-switched', location: { id: 'loc' }, time: { created: 4 } },
		{ id: 'idle-fail', type: 'idle', outcome: 'failed', time: { created: 5 },
			error: { type: 'unknown', message: 'The provider failed.' } },
		{ id: 'idle-stop', type: 'idle', outcome: 'interrupted', time: { created: 6 } },
		{ id: 'compact', type: 'compaction', status: 'running', reason: 'auto', summary: 'summary', time: { created: 7 } },
		{ id: 'shell', type: 'shell', shellID: 'sh', command: 'npm test', status: 'exited',
			time: { created: 8 },
			output: { output: 'all good', cursor: 0, size: 0, truncated: false, started: 0 } },
		{ id: 'skill', type: 'skill', skill: 'apply', name: 'apply', text: '<b>Injected skill</b>', time: { created: 9 } },
		{ id: 'system', type: 'system', text: '<i>System text</i>', time: { created: 10 } },
		{ id: 'synthetic', type: 'synthetic', text: '<u>Synthetic text</u>', time: { created: 11 } },
		{ id: 'future', type: 'future-record', text: '<script>unsafe()</script>', time: { created: 12 } },
	]);

	const body = target.textContent;
	for (const quiet of ['Execution succeeded.', 'agent-switched', 'model-switched', 'location-switched']) {
		assert.equal(body.includes(quiet), false, `Routine record stays out: ${quiet}`);
	}

	const outcomes = [...target.querySelectorAll('.opencode-outcome')];
	assert.deepEqual(outcomes.map((entry) => entry.textContent), [
		'Execution failed. The provider failed.', 'Execution interrupted.',
	]);
	assert.ok(outcomes[0].classList.contains('is-failed'));
	assert.ok(outcomes[1].classList.contains('is-interrupted'));
	assert.match(target.querySelector('.opencode-notice').textContent, /Compacting the conversation…/);

	const shell = target.querySelector('.opencode-message-shell details.opencode-disclosure');
	assert.ok(shell);
	assert.equal(shell.open, false, 'Shell output starts collapsed');
	assert.match(shell.querySelector('summary').textContent, /Shell · npm test/);
	assert.match(shell.querySelector('.opencode-disclosure-text').textContent, /all good/);

	const skill = target.querySelector('.opencode-message-skill');
	assert.match(skill.querySelector('summary').textContent, /^Skill · apply$/);
	assert.match(skill.querySelector('.opencode-disclosure-text').textContent, /<b>Injected skill<\/b>/);
	assert.equal(skill.querySelector('.markdown-rendered'), null, 'Injected text is not Markdown-rendered');
	assert.equal(target.querySelectorAll('b').length, 0);

	assert.match(target.querySelector('.opencode-message-system summary').textContent, /^System note$/);
	assert.match(target.querySelector('.opencode-message-synthetic summary').textContent, /^Synthetic note$/);

	const unknown = target.querySelector('.opencode-message-future-record');
	assert.match(unknown.querySelector('summary').textContent, /^System note$/);
	assert.equal(unknown.textContent.includes('future-record'), false, 'Unknown types do not leak their type name');
	assert.match(unknown.querySelector('.opencode-disclosure-text').textContent, /<script>unsafe\(\)<\/script>/);
	assert.equal(target.querySelectorAll('script').length, 0);
	assert.equal(target.querySelectorAll('.markdown-rendered').length, 0, 'Only prompts and answers use Markdown');
});

test('one faint footnote closes an assistant run with resolved labels and duration', () => {
	const target = container();
	renderer(target, {
		modelLabel: (model) => `Model ${model.id}`,
		agentLabel: (agent) => `Agent ${agent}`,
	}).render([
		user('u1', 'Explain.'),
		assistant('a1', text('One.'), { created: 10000, completed: 20000 }),
		assistant('a2', text('Two.'), { created: 20000, completed: 82000 }),
	]);
	const assistants = [...target.querySelectorAll('.opencode-message-assistant')];
	const footnotes = target.querySelectorAll('.opencode-message-footnote');
	assert.equal(footnotes.length, 1);
	assert.equal(assistants[0].querySelector('.opencode-message-footnote'), null);
	assert.equal(assistants[1].querySelector('.opencode-message-footnote'), footnotes[0]);
	assert.equal(footnotes[0].textContent, 'Model gpt-5 · Agent build · 1m 12s');
	assert.equal(footnotes[0].children.length, 0, 'The footnote is text only');
	assert.equal(footnotes[0].querySelector('button, [role="button"], [class*="badge"]'), null);
	assert.equal(footnotes[0].getAttribute('aria-label'), null);

	const fallback = container();
	renderer(fallback).render([assistant('a1', text('One.'), { created: 1000, completed: 14400 })]);
	assert.equal(fallback.querySelector('.opencode-message-footnote').textContent, 'openai · gpt-5 · build · 13.4s');
});

test('durations use 0.4s, 13.4s, and 1m 12s, and missing values are omitted', () => {
	const cases = [
		[1400, '0.4s'],
		[14400, '13.4s'],
		[73000, '1m 12s'],
	];
	for (const [completed, expected] of cases) {
		const target = container();
		renderer(target).render([assistant('a1', text('One.'), { created: 1000, completed })]);
		const footnote = target.querySelector('.opencode-message-footnote');
		assert.ok(footnote.textContent.endsWith(`· ${expected}`), `${expected} is shown`);
	}

	const partial = container();
	renderer(partial).render([{ id: 'a1', type: 'assistant', time: { created: 1000, completed: 1400 }, content: text('One.') }]);
	assert.equal(partial.querySelector('.opencode-message-footnote').textContent, '0.4s',
		'Missing model and agent values are omitted rather than placeholdered');

	const streaming = container();
	renderer(streaming).render([assistant('a1', text('One.'), { created: 1000 })]);
	assert.equal(streaming.querySelector('.opencode-message-footnote'), null, 'No footnote while streaming');
});

test('a footnote appears only on the last message of each contiguous run', () => {
	const target = container();
	renderer(target).render([
		assistant('a1', text('One.'), { created: 1000, completed: 2000 }),
		{ id: 'idle', type: 'idle', outcome: 'succeeded', time: { created: 2000 } },
		user('u1', 'Next.'),
		assistant('a2', text('Two.'), { created: 3000, completed: 3400 }),
		assistant('a3', text('Three.'), { created: 3400, completed: 4000 }),
	]);
	const assistants = [...target.querySelectorAll('.opencode-message-assistant')];
	assert.equal(assistants.length, 3);
	assert.equal(target.querySelectorAll('.opencode-message-footnote').length, 2);
	assert.ok(assistants[0].querySelector('.opencode-message-footnote'), 'The suppressed idle keeps the run contiguous');
	assert.equal(assistants[1].querySelector('.opencode-message-footnote'), null);
	assert.ok(assistants[2].querySelector('.opencode-message-footnote'));
});
