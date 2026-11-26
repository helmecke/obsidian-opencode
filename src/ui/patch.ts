import type { FileDiffInfo } from '@opencode/client';

export type PatchLineKind = 'add' | 'remove' | 'context' | 'hunk' | 'meta';

export interface PatchLine {
	readonly kind: PatchLineKind;
	/** Line content without the unified-diff marker. */
	readonly text: string;
}

const metaPrefixes = ['diff ', 'index ', 'new file mode ', 'deleted file mode ', 'old mode ', 'new mode ',
	'similarity index ', 'rename from ', 'rename to ', 'copy from ', 'copy to '];

/** Split the service's unified patch into display rows. Pure and dependency-free. */
export function parsePatch(patch: string): PatchLine[] {
	if (!patch) return [];
	const lines = patch.replace(/\r\n/g, '\n').split('\n');
	if (lines.at(-1) === '') lines.pop();
	return lines.map((line): PatchLine => {
		if (line.startsWith('@@')) return { kind: 'hunk', text: line };
		if (line.startsWith('+++') || line.startsWith('---')) return { kind: 'meta', text: line };
		if (line.startsWith('+')) return { kind: 'add', text: line.slice(1) };
		if (line.startsWith('-')) return { kind: 'remove', text: line.slice(1) };
		if (line.startsWith(' ')) return { kind: 'context', text: line.slice(1) };
		if (line.startsWith('\\')) return { kind: 'meta', text: line };
		return { kind: metaPrefixes.some((prefix) => line.startsWith(prefix)) ? 'meta' : 'context', text: line };
	});
}

/** A binary marker is presented as a note, never as diff rows. */
export function isBinaryPatch(patch: string): boolean {
	return /^(?:Binary files .* differ|GIT binary patch)/m.test(patch);
}

export function diffStatusLabel(status: FileDiffInfo['status']): string {
	if (status === 'added') return 'Added';
	if (status === 'deleted') return 'Deleted';
	return 'Modified';
}

export const DEFAULT_PATCH_CAP = 200_000;

export interface PatchRenderOptions {
	/** Character budget for one patch; Infinity renders everything. */
	readonly cap?: number;
}

/** Render one changed file as a header plus a parsed, tinted unified diff. */
export function renderPatch(container: HTMLElement, diff: FileDiffInfo, options: PatchRenderOptions = {}): void {
	container.empty();
	const header = container.createDiv({ cls: 'opencode-diff-header' });
	header.createSpan({ cls: 'opencode-diff-name', text: diff.file });
	header.createSpan({ cls: 'opencode-diff-status', text: diffStatusLabel(diff.status) });
	const counts = header.createSpan({ cls: 'opencode-diff-counts' });
	counts.createSpan({ cls: 'opencode-diff-additions', text: `+${diff.additions}` });
	counts.createSpan({ cls: 'opencode-diff-deletions', text: `−${diff.deletions}` });
	if (diff.more) container.createDiv({ cls: 'opencode-diff-partial', text: 'Only part of this change is shown.' });
	if (!diff.patch.trim()) {
		container.createDiv({ cls: 'opencode-diff-note', text: 'No text patch is available for this file.' });
		return;
	}
	if (isBinaryPatch(diff.patch)) {
		container.createDiv({ cls: 'opencode-diff-note', text: 'Binary file. No text patch is available.' });
		return;
	}
	renderLines(container, diff, options.cap ?? DEFAULT_PATCH_CAP);
}

function renderLines(container: HTMLElement, diff: FileDiffInfo, cap: number): void {
	const lines = parsePatch(diff.patch);
	const list = container.createDiv({ cls: 'opencode-diff-lines' });
	let used = 0;
	let shown = 0;
	for (const line of lines) {
		const cost = line.text.length + 1;
		if (used + cost > cap && shown > 0) break;
		used += cost;
		shown++;
		const row = list.createDiv({ cls: `opencode-diff-line is-${line.kind}` });
		if (line.kind === 'add' || line.kind === 'remove' || line.kind === 'context') {
			row.createSpan({
				cls: 'opencode-diff-marker',
				text: line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ',
			});
		}
		row.createSpan({ cls: 'opencode-diff-text', text: line.text });
	}
	if (shown >= lines.length) return;
	container.createDiv({ cls: 'opencode-diff-truncated',
		text: `Showing the first ${shown} of ${lines.length} lines.` });
	const button = container.createEl('button', { cls: 'opencode-diff-show-full', text: 'Show full patch' });
	button.addEventListener('click', () => renderPatch(container, diff, { cap: Infinity }));
}
