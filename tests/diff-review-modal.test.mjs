import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { click, createObsidian, installDom } from './dom-helper.mjs';

installDom();

const obsidian = createObsidian({});
const bundle = await build({ entryPoints: ['src/ui/diff-review-modal.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? obsidian : createRequire(import.meta.url)(name), module, module.exports);
const { SessionDiffReviewModal } = module.exports;

const wait = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
const file = (name, extra = {}) => ({
	file: name, patch: `@@ -1 +1 @@\n-old\n+new`, additions: 1, deletions: 1, status: 'modified', ...extra,
});

test('the review modal refreshes on open and lists files with counts that expand', async () => {
	let calls = 0;
	const files = [file('Notes/A.md'), file('Notes/B.md', { status: 'deleted', additions: 0, deletions: 3 })];
	const modal = new SessionDiffReviewModal({}, { load: async () => { calls++; return files; } });
	modal.open();
	assert.equal(modal.titleEl.textContent, 'Changes in this conversation');
	assert.match(modal.contentEl.textContent, /Loading changes/);
	await wait();
	assert.equal(calls, 1);
	const rows = [...modal.contentEl.querySelectorAll('details.opencode-file')];
	assert.equal(rows.length, 2);
	assert.equal(rows[0].querySelector('.opencode-file-name').textContent, 'Notes/A.md');
	assert.equal(rows[0].querySelector('.opencode-file-meta').textContent, 'Modified · +1 −1');
	assert.equal(rows[1].querySelector('.opencode-file-meta').textContent, 'Deleted · +0 −3');
	const body = rows[0].querySelector('.opencode-file-patch');
	assert.equal(body.childElementCount, 0, 'Per-file patches stay collapsed');
	rows[0].open = true;
	rows[0].dispatchEvent(new Event('toggle'));
	assert.ok(body.querySelector('.opencode-diff-lines'));
	assert.equal(body.querySelectorAll('.opencode-diff-line.is-add').length, 1);

	modal.close();
	assert.equal(modal.contentEl.childElementCount, 0);
	modal.open();
	await wait();
	assert.equal(calls, 2, 'Reopening the review requests the current server state again');
});

test('the review modal shows an empty note and a retryable error', async () => {
	const empty = new SessionDiffReviewModal({}, { load: async () => [] });
	empty.open();
	await wait();
	assert.match(empty.contentEl.textContent, /No file changes were found in this conversation/);
	empty.close();

	let attempts = 0;
	const failing = new SessionDiffReviewModal({}, { load: async () => {
		if (++attempts === 1) throw new Error('private upstream detail');
		return [file('Notes/A.md')];
	} });
	failing.open();
	await wait();
	const error = failing.contentEl.querySelector('.opencode-diff-error');
	assert.match(error.textContent, /Unable to load changes\./);
	assert.equal(failing.contentEl.textContent.includes('private'), false);
	const retry = error.querySelector('button');
	assert.equal(retry.textContent, 'Retry');
	click(retry);
	await wait();
	assert.equal(attempts, 2);
	assert.equal(failing.contentEl.querySelectorAll('details.opencode-file').length, 1);
	assert.equal(failing.contentEl.querySelector('.opencode-diff-error'), null);
	failing.close();
});
