import type { FileDiffInfo } from '@opencode/client';
import { isOutsideVaultPath } from '../opencode/diff-bounds';
import { createDisclosureIcon } from './disclosure-icon';
import { diffStatusLabel, renderPatch } from './patch';

export interface ChangedFilesActions {
	open?(file: FileDiffInfo): void;
	copy?(patch: string): Promise<void> | void;
	notify?(message: string): void;
}

/** A deleted or outside-vault file keeps its path but has no open action. */
export function canOpenFile(file: FileDiffInfo): boolean {
	return file.status !== 'deleted' && !isOutsideVaultPath(file.file);
}

function accessLabel(file: FileDiffInfo): string {
	return [file.file, diffStatusLabel(file.status), `${file.additions} additions`,
		`${file.deletions} deletions`, ...(file.more ? ['partial'] : [])].join(', ');
}

/** Flat list of changed files; each row expands to its own patch. */
export class ChangedFilesView {
	readonly element: HTMLElement;
	constructor(container: HTMLElement, private readonly actions: ChangedFilesActions = {}) {
		this.element = container.createDiv({ cls: 'opencode-changed-files',
			attr: { role: 'group', 'aria-label': 'Changed files' } });
	}

	render(files: readonly FileDiffInfo[]): void {
		this.element.empty();
		if (!files.length) {
			this.element.createDiv({ cls: 'opencode-diff-note', text: 'No file changes were found.' });
			return;
		}
		for (const file of files) this.renderFile(file);
	}

	private renderFile(diff: FileDiffInfo): void {
		const row = this.element.createEl('details', { cls: 'opencode-file' });
		const summary = row.createEl('summary', { cls: 'opencode-disclosure-summary',
			attr: { 'aria-label': `Changed file ${accessLabel(diff)}` } });
		createDisclosureIcon(summary, 'file-diff', 'opencode-file-icon opencode-disclosure-icon');
		summary.createSpan({ cls: 'opencode-file-name', text: diff.file });
		summary.createSpan({ cls: 'opencode-file-meta',
			text: `${diffStatusLabel(diff.status)} · +${diff.additions} −${diff.deletions}` });
		const body = row.createDiv({ cls: 'opencode-file-body' });
		const actions = body.createDiv({ cls: 'opencode-file-actions' });

		const openable = canOpenFile(diff);
		const open = actions.createEl('button', { text: 'Open', attr: { 'aria-label': `Open ${diff.file}` } });
		open.disabled = !openable;
		open.setAttribute('aria-disabled', String(!openable));
		if (!openable) {
			open.setAttribute('title', diff.status === 'deleted'
				? 'Deleted files cannot be opened.' : 'Files outside the vault cannot be opened.');
		}
		open.addEventListener('click', () => { if (openable) this.actions.open?.(diff); });

		const copy = actions.createEl('button', { text: 'Copy patch',
			attr: { 'aria-label': `Copy patch for ${diff.file}` } });
		copy.addEventListener('click', () => { void this.copy(diff.patch); });

		const patch = body.createDiv({ cls: 'opencode-file-patch' });
		let rendered = false;
		row.addEventListener('toggle', () => {
			if (!row.open || rendered) return;
			rendered = true;
			renderPatch(patch, diff);
		});
	}

	private async copy(text: string): Promise<void> {
		try {
			if (this.actions.copy) await this.actions.copy(text);
			else await navigator.clipboard.writeText(text);
		} catch {
			this.actions.notify?.('Unable to copy the patch.');
		}
	}
}

export interface ChangedFilesLoader extends ChangedFilesActions {
	load(): Promise<readonly FileDiffInfo[]>;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/** A collapsed turn summary naming the files; expansion lazily loads their patches. */
export class ChangedFilesDisclosure {
	readonly element: HTMLDetailsElement;
	private readonly summary: HTMLElement;
	private readonly preview: HTMLElement;
	private readonly body: HTMLElement;
	private key = '';
	private state: LoadState = 'idle';
	private generation = 0;

	constructor(container: HTMLElement, private readonly loader: ChangedFilesLoader) {
		this.element = container.createEl('details', { cls: 'opencode-changed-files opencode-turn-changes' });
		this.summary = this.element.createEl('summary', { cls: 'opencode-disclosure-summary' });
		createDisclosureIcon(this.summary, 'file-diff', 'opencode-changed-files-icon opencode-disclosure-icon');
		this.summary.createSpan({ cls: 'opencode-changed-files-name', text: 'Changed files' });
		this.preview = this.summary.createSpan({ cls: 'opencode-changed-files-preview' });
		this.body = this.element.createDiv({ cls: 'opencode-changed-files-body' });
		this.element.addEventListener('toggle', () => {
			if (this.element.open && this.state === 'idle') void this.request();
		});
	}

	update(files: readonly string[], load: () => Promise<readonly FileDiffInfo[]>): void {
		const text = files.join(', ');
		this.preview.setText(text);
		this.preview.setAttribute('title', text);
		this.summary.setAttribute('aria-label', `Changed files: ${text}`);
		this.loader.load = load;
		const key = files.join('\n');
		if (key === this.key) return;
		this.key = key;
		this.generation++;
		this.state = 'idle';
		this.body.empty();
		if (this.element.open) void this.request();
	}

	dispose(): void {
		this.generation++;
		this.element.remove();
	}

	private async request(): Promise<void> {
		if (this.state === 'loading') return;
		this.state = 'loading';
		const generation = this.generation;
		this.body.empty();
		this.body.createDiv({ cls: 'opencode-muted', text: 'Loading changes…' });
		try {
			const files = await this.loader.load();
			if (generation !== this.generation) return;
			this.state = 'loaded';
			this.body.empty();
			new ChangedFilesView(this.body, this.loader).render(files);
		} catch {
			if (generation !== this.generation) return;
			this.state = 'error';
			this.body.empty();
			const error = this.body.createDiv({ cls: 'opencode-diff-error' });
			error.createSpan({ text: 'Unable to load changes.' });
			const retry = error.createEl('button', { text: 'Retry', attr: { 'aria-label': 'Retry loading changes' } });
			retry.addEventListener('click', () => {
				this.state = 'idle';
				void this.request();
			});
		}
	}
}
