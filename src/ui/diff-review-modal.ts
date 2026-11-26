import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { FileDiffInfo } from '@opencode/client';
import { ChangedFilesView } from './changed-files';
import type { ChangedFilesActions } from './changed-files';

export interface DiffReviewOptions extends ChangedFilesActions {
	load(): Promise<readonly FileDiffInfo[]>;
}

/** Read-only review of every file changed during the current conversation. */
export class SessionDiffReviewModal extends Modal {
	private generation = 0;
	constructor(app: App, private readonly options: DiffReviewOptions) { super(app); }

	onOpen(): void {
		this.titleEl.setText('Changes in this conversation');
		this.contentEl.empty();
		void this.load();
	}

	onClose(): void {
		this.generation++;
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		const generation = this.generation;
		this.contentEl.empty();
		this.contentEl.createEl('p', { cls: 'opencode-muted', text: 'Loading changes…' });
		try {
			const files = await this.options.load();
			if (generation !== this.generation) return;
			this.contentEl.empty();
			if (!files.length) {
				this.contentEl.createEl('p', { cls: 'opencode-muted',
					text: 'No file changes were found in this conversation.' });
				return;
			}
			new ChangedFilesView(this.contentEl, this.options).render(files);
		} catch {
			if (generation !== this.generation) return;
			this.contentEl.empty();
			const error = this.contentEl.createDiv({ cls: 'opencode-diff-error' });
			error.createSpan({ text: 'Unable to load changes.' });
			const retry = error.createEl('button', { text: 'Retry', attr: { 'aria-label': 'Retry loading changes' } });
			retry.addEventListener('click', () => { void this.load(); });
		}
	}
}
