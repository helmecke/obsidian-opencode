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
const tool = (id, input = { filePath: 'Notes/Example.md' }) => ({ type: 'tool', id, name: 'read', executed: true,
	state: { status: 'running', input, metadata: {} }, time: { created: 10 } });
const user = (id, value) => ({ id, type: 'user', text: value, time: { created: 0 } });
const synthetic = (id, value, metadata, description) =>
	({ id, type: 'synthetic', text: value, metadata, description, time: { created: 0 } });
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
	const callout = userEntry.querySelector('.callout[data-callout="prompt"]');
	assert.ok(callout, 'The prompt is a prompt-type callout');
	assert.ok(callout.querySelector('.callout-icon .svg-icon'), 'The callout title carries an icon');
	assert.equal(callout.querySelector('.callout-title-inner').textContent, 'You');
	assert.equal(callout.querySelector('.callout-content .opencode-prompt-text').textContent,
		'Plan the note.\n  Keep indentation.');
	assert.ok(userEntry.querySelector('.opencode-prompt.markdown-rendered'), 'Native Markdown rules apply around the prompt');
	const userBody = userEntry.querySelector('.opencode-message-body');
	assert.ok(userBody.classList.contains('opencode-message-body'));
	assert.ok(userBody.classList.contains('opencode-message-body-user'));
	assert.equal(target.querySelectorAll('.opencode-message-role').length, 0, 'No separate role elements');
	assert.equal(target.querySelectorAll('blockquote').length, 0, 'Neither prompt nor answers are quoted');

	const assistantEntries = target.querySelectorAll('.opencode-message-assistant');
	assert.equal(assistantEntries.length, 2);
	assert.equal(assistantEntries[0].getAttribute('aria-label'), 'OpenCode');
	const assistantBody = assistantEntries[0].querySelector('.opencode-message-body');
	assert.ok(assistantBody.classList.contains('opencode-message-body-assistant'));
	assert.equal(assistantEntries[0].textContent.includes('OpenCode'), false);
});

test('reasoning folds look like tool rows with an icon, one-line preview, and chevron affordance', () => {
	const target = container();
	const view = renderer(target, { showReasoning: () => true });
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

test('reasoning stays out of the transcript unless the setting is enabled', () => {
	for (const options of [{}, { showReasoning: () => false }]) {
		const target = container();
		renderer(target, options).render([
			assistant('a1', [reasoning('Private deliberation.'), ...text('The answer.')],
				{ created: 1000, completed: 2000 }),
		]);
		assert.equal(target.querySelector('.opencode-reasoning'), null, 'No reasoning disclosure exists');
		assert.equal(target.querySelector('.opencode-part-reasoning'), null, 'No empty reasoning part is left behind');
		assert.equal(target.textContent.includes('Private deliberation.'), false,
			'Neither the preview nor the body reaches the DOM');
		assert.match(target.textContent, /The answer\./, 'The answer text still renders');
		assert.equal(target.querySelector('.opencode-message-footnote').textContent,
			'openai · gpt-5 · build · 1.0s', 'The footnote is unchanged');
	}
});

test('toggling reasoning live removes and recreates the disclosure around answers and tools', () => {
	const target = container();
	let show = true;
	const markdowns = [];
	const createMarkdown = (parent) => {
		const el = parent.createDiv({ cls: 'opencode-markdown markdown-rendered' });
		const record = {
			el,
			disposed: 0,
			set(value) { el.setText(value); },
			dispose() { record.disposed++; el.empty(); },
		};
		markdowns.push(record);
		return record;
	};
	const view = new ConversationRenderer(target, { createMarkdown, showReasoning: () => show });
	const message = (thought) => assistant('a1', [reasoning(thought), tool('t1'), ...text('Answer.')],
		{ created: 1000, completed: 2000 });

	view.render([message('First thought.')]);
	const details = target.querySelector('details.opencode-reasoning');
	assert.ok(details, 'Enabled reasoning renders the disclosure');
	assert.equal(details.querySelector('.opencode-reasoning-preview').textContent, 'First thought.');
	const reasoningMarkdown = markdowns.find((record) =>
		record.el.closest('.opencode-reasoning-body') && record.disposed === 0);
	assert.ok(reasoningMarkdown, 'The reasoning body has its own Markdown');
	assert.equal(reasoningMarkdown.el.textContent, 'First thought.');
	assert.ok(target.querySelector('details.opencode-tool'), 'The tool part renders');

	show = false;
	view.render([message('First thought. Continued.')]);
	assert.equal(target.querySelector('.opencode-reasoning'), null, 'The disclosure disappears on the next render');
	assert.equal(reasoningMarkdown.disposed, 1, 'Its Markdown is disposed rather than kept hidden');
	assert.ok(target.querySelector('details.opencode-tool'), 'The tool part stays');
	assert.match(target.textContent, /Answer\./, 'The answer text stays');
	assert.equal(markdowns.filter((record) => record.disposed === 0).length, 1,
		'Only the answer Markdown stays live');

	show = true;
	view.render([message('First thought. Continued.')]);
	const recreated = target.querySelector('details.opencode-reasoning');
	assert.ok(recreated, 'Enabling again recreates the disclosure');
	assert.equal(recreated.querySelector('.opencode-reasoning-preview').textContent, 'First thought. Continued.',
		'The preview shows the accumulated text');
	assert.equal(recreated.querySelector('.opencode-reasoning-body').textContent, 'First thought. Continued.',
		'The recreated body shows the accumulated reasoning Markdown');
	assert.ok(target.querySelector('details.opencode-tool'), 'The tool part is not recreated away');
	assert.match(target.textContent, /Answer\./);
});

test('a pending prompt keeps the callout shape and its status line', () => {
	const target = container();
	const view = renderer(target);
	view.render([], { id: 'pending-1', phase: 'sending', text: 'Draft\n  prompt' });
	const prompt = target.querySelector('.callout[data-callout="prompt"] .opencode-prompt-text');
	assert.equal(prompt.textContent, 'Draft\n  prompt');
	assert.equal(target.querySelector('.opencode-prompt-status').textContent, 'Sending…');
	assert.equal(target.querySelector('.opencode-message-user').classList.contains('is-uncertain'), false);

	view.render([], { id: 'pending-1', phase: 'uncertain', text: 'Draft\n  prompt' });
	assert.equal(target.querySelector('.opencode-prompt-status').textContent, 'Not confirmed');
	assert.equal(target.querySelector('.opencode-message-user').classList.contains('is-uncertain'), true);
});

test('a subagent result is recognized from metadata only, with a sane title', () => {
	const body = '<subagent sessionID="ses_child" state="completed" description="Find the note">\n## Report\n\nSee [[Note]].\n</subagent>';
	const marked = container();
	renderer(marked).render([synthetic('sub-marked', body, {
		source: 'subagent', agent: 'Explore', description: 'Find the note', state: 'completed' })]);
	const embed = marked.querySelector('.opencode-message-subagent');
	assert.ok(embed, 'A marked record becomes a subagent embed');
	assert.equal(embed.querySelector('.embed-title.markdown-embed-title').textContent,
		'Explore subagent · Find the note');
	assert.equal(embed.getAttribute('aria-label'), 'Explore subagent · Find the note');

	const unmarked = container();
	renderer(unmarked).render([synthetic('sub-unmarked', body)]);
	assert.equal(unmarked.querySelector('.opencode-message-subagent'), null,
		'The same text without metadata stays a generic note');
	assert.match(unmarked.querySelector('.opencode-message-synthetic summary').textContent, /^Synthetic note$/);
	assert.ok(unmarked.querySelector('.opencode-disclosure-text').textContent.includes('<subagent sessionID="ses_child"'),
		'The unmarked body stays plain text');

	const agentless = container();
	renderer(agentless).render([synthetic('sub-agentless', body,
		{ source: 'subagent', description: 'Find the note' })]);
	assert.equal(agentless.querySelector('.embed-title.markdown-embed-title').textContent,
		'Subagent · Find the note');

	const described = container();
	renderer(described).render([synthetic('sub-described', body,
		{ source: 'subagent', agent: 'Explore', state: 'completed' }, 'Summarize the note')]);
	assert.equal(described.querySelector('.embed-title.markdown-embed-title').textContent,
		'Explore subagent · Summarize the note', 'The record-level task description is used');

	const bare = container();
	renderer(bare).render([synthetic('sub-bare', body, { source: 'subagent' })]);
	assert.equal(bare.querySelector('.embed-title.markdown-embed-title').textContent, 'Subagent');

	const malformed = container();
	renderer(malformed).render([synthetic('sub-malformed', body,
		{ source: 'subagent', agent: 'Explore' }, 42)]);
	assert.equal(malformed.querySelector('.embed-title.markdown-embed-title').textContent, 'Explore subagent',
		'A non-string description is ignored');
});

test('a subagent report renders as a Markdown embed with an embed title instead of a disclosure', () => {
	const target = container();
	renderer(target).render([synthetic('sub', '<subagent sessionID="ses_child" state="completed" description="Find the note">\n## Report\n\n**Bold** and [[Note]].\n</subagent>', {
		source: 'subagent', agent: 'Explore', description: 'Find the note', state: 'completed' })]);
	const root = target.querySelector('.opencode-message.opencode-message-synthetic.opencode-message-subagent');
	assert.ok(root, 'The synthetic message carries the subagent class');
	const body = root.querySelector('.opencode-message-body-embed');
	assert.ok(body);
	const embed = body.querySelector('.internal-embed.markdown-embed.inline-embed.is-loaded');
	assert.ok(embed, 'The report is a native embed');
	const title = embed.querySelector('.embed-title.markdown-embed-title');
	assert.equal(title.textContent, 'Explore subagent · Find the note');
	assert.equal(root.getAttribute('aria-label'), title.textContent, 'The accessible name matches the title');
	assert.equal(root.querySelector('.opencode-subagent-caption'), null, 'No custom caption remains');
	assert.equal(root.querySelector('blockquote'), null, 'No synthetic quote frame is used');
	const markdown = embed.querySelector('.markdown-embed-content .opencode-markdown.markdown-rendered');
	assert.ok(markdown, 'The report uses a Markdown block inside the embed content');
	assert.match(markdown.textContent, /## Report/);
	assert.match(markdown.textContent, /\*\*Bold\*\* and \[\[Note\]\]\./);
	assert.equal(markdown.textContent.includes('<subagent'), false, 'The opening wrapper is absent');
	assert.equal(markdown.textContent.includes('</subagent>'), false, 'The closing wrapper is absent');
	assert.equal(target.innerHTML.includes('<subagent'), false, 'No wrapper tag reaches the document');
	assert.equal(root.querySelector('summary'), null, 'A report is not folded');
	assert.equal(root.querySelector('pre'), null, 'A report is not preformatted');
});

test('a cancelled subagent result keeps its report and names the state', () => {
	const target = container();
	renderer(target).render([synthetic('sub', '<subagent sessionID="ses_child" state="cancelled" description="Long task">\nPartial **report**.\n</subagent>', {
		source: 'subagent', agent: 'General', description: 'Long task', state: 'cancelled' })]);
	assert.equal(target.querySelector('.embed-title.markdown-embed-title').textContent,
		'General subagent · Long task · cancelled');
	assert.match(target.querySelector('.markdown-embed-content .opencode-markdown').textContent,
		/Partial \*\*report\*\*\./, 'The available report text stays visible');
});

test('an unchanged subagent embed keeps its nodes and is disposed with the record', () => {
	const target = container();
	const markdowns = [];
	const view = new ConversationRenderer(target, { createMarkdown: (parent) => {
		const el = parent.createDiv({ cls: 'opencode-markdown markdown-rendered' });
		const record = {
			el,
			disposed: 0,
			set(value) { el.setText(value); },
			dispose() { record.disposed++; el.empty(); },
		};
		markdowns.push(record);
		return record;
	} });
	const record = synthetic('sub', '<subagent sessionID="ses_child" state="completed" description="Find the note">\nReport.\n</subagent>', {
		source: 'subagent', agent: 'Explore', description: 'Find the note', state: 'completed' });
	view.render([record]);
	const title = target.querySelector('.embed-title.markdown-embed-title');
	const embed = target.querySelector('.internal-embed.markdown-embed');
	const markdown = target.querySelector('.markdown-embed-content .opencode-markdown');
	assert.ok(title && embed && markdown);

	view.render([record]);
	assert.equal(target.querySelector('.embed-title.markdown-embed-title'), title, 'The title node is kept');
	assert.equal(target.querySelector('.internal-embed.markdown-embed'), embed, 'The embed node is kept');
	assert.equal(target.querySelector('.markdown-embed-content .opencode-markdown'), markdown,
		'The Markdown node is kept');
	assert.equal(markdowns.length, 1, 'The body is rendered once');
	assert.equal(markdowns[0].disposed, 0);

	view.render([]);
	assert.equal(markdowns[0].disposed, 1, 'Removing the record disposes its Markdown');
	assert.equal(target.querySelector('.internal-embed.markdown-embed'), null);
	assert.equal(target.querySelector('.opencode-message-subagent'), null);
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
		{ id: 'synthetic-shell', type: 'synthetic', text: '<s>Replayed shell output</s>',
			metadata: { source: 'shell' }, time: { created: 12 } },
		{ id: 'synthetic-page', type: 'synthetic', text: '<em>Page answer</em>',
			metadata: { source: 'page-answer' }, time: { created: 13 } },
		{ id: 'future', type: 'future-record', text: '<script>unsafe()</script>', time: { created: 14 } },
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
	assert.equal(target.querySelectorAll('b').length, 0);

	assert.match(target.querySelector('.opencode-message-system summary').textContent, /^System note$/);
	const synthetics = [...target.querySelectorAll('.opencode-message-synthetic')];
	assert.equal(synthetics.length, 3);
	for (const entry of synthetics) {
		assert.match(entry.querySelector('summary').textContent, /^Synthetic note$/);
		assert.ok(entry.querySelector('pre.opencode-disclosure-text'));
	}

	const unknown = target.querySelector('.opencode-message-future-record');
	assert.match(unknown.querySelector('summary').textContent, /^System note$/);
	assert.equal(unknown.textContent.includes('future-record'), false, 'Unknown types do not leak their type name');
	assert.match(unknown.querySelector('.opencode-disclosure-text').textContent, /<script>unsafe\(\)<\/script>/);
	assert.equal(target.querySelectorAll('script').length, 0);

	const injected = [skill, target.querySelector('.opencode-message-system'),
		target.querySelector('.opencode-message-shell'), ...synthetics, unknown];
	for (const entry of injected) {
		assert.equal(entry.querySelector('.markdown-rendered'), null,
			'Injected text is not Markdown-rendered');
		assert.equal(entry.querySelector('.opencode-message-body-embed'), null, 'Injected text is not an embed');
		assert.ok(entry.querySelector('pre.opencode-disclosure-text'), 'Injected text stays plain text');
	}
	assert.equal(target.querySelectorAll('.markdown-rendered').length, 0, 'No Markdown frame exists for these records');
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
