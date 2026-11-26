import { ConfirmationModal, FuzzySuggestModal, Modal, Notice } from 'obsidian';
import type { App, FuzzyMatch } from 'obsidian';
import type { SessionInfo } from '@opencode/client';
import { OpenCodeApiCompatibilityError } from '../opencode/compatibility';
import { SessionError } from '../opencode/sessions';

/** Compact relative time for the switcher's secondary line. */
export function relativeTime(updated: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - updated) / 1000));
	if (seconds < 60) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days} d ago`;
	const months = Math.round(days / 30);
	return months < 12 ? `${months} mo ago` : `${Math.round(months / 12)} y ago`;
}

/**
 * Obsidian's quick-switcher surface over this vault's conversations. The list is
 * fetched fresh on open; choosing delegates the switch to the caller.
 */
export class SessionSwitcherModal extends FuzzySuggestModal<SessionInfo> {
	private items: SessionInfo[] = [];
	constructor(app: App,
		private readonly list: () => Promise<readonly SessionInfo[]>,
		private readonly currentID: () => string | undefined,
		private readonly select: (id: string) => Promise<void>) {
		super(app);
		this.setPlaceholder('Switch conversation…');
	}

	getItems(): SessionInfo[] { return this.items; }

	getItemText(item: SessionInfo): string { return item.title?.trim() || 'New conversation'; }

	async onOpen(): Promise<void> {
		this.items = [];
		await super.onOpen();
		void this.load();
	}

	private async load(): Promise<void> {
		try {
			const sessions = await this.list();
			this.items = [...sessions].sort((left, right) => right.time.updated - left.time.updated);
		} catch {
			this.items = [];
			new Notice('Unable to list conversations.');
		}
		// The base modal only recomputes matches on input; refresh after the async list.
		this.inputEl?.dispatchEvent(new Event('input'));
	}

	renderSuggestion(match: FuzzyMatch<SessionInfo>, el: HTMLElement): void {
		const session = match.item;
		const current = session.id === this.currentID();
		el.addClass('opencode-session-suggestion');
		el.toggleClass('is-current', current);
		el.createDiv({ cls: 'opencode-session-suggestion-title',
			text: session.title?.trim() || 'New conversation' });
		const meta = el.createDiv({ cls: 'opencode-session-suggestion-meta' });
		meta.createSpan({ text: relativeTime(session.time.updated) });
		if (current) meta.createSpan({ cls: 'opencode-session-suggestion-current', text: 'Current' });
	}

	onChooseItem(item: SessionInfo): void {
		this.close();
		void this.select(item.id).catch((error: unknown) => {
			new Notice(error instanceof SessionError || error instanceof OpenCodeApiCompatibilityError
				? error.message : 'Unable to switch conversations.');
		});
	}
}

/** Confirms that switching or creating may discard unsent composer text. */
export class ConfirmDiscardModal extends ConfirmationModal {
	private answered = false;
	constructor(app: App, private readonly decide: (confirmed: boolean) => void) { super(app); }

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.titleEl.setText('Discard unsent message?');
		this.contentEl.empty();
		this.contentEl.createEl('p', {
			text: 'The message in the composer has not been sent. Switching conversations discards it.',
		});
		this.addButton((button) => button
			.setButtonText('Keep editing')
			.setCancel()
			.setInitialFocus()
			.onClick(() => this.answer(false)));
		this.addButton((button) => button
			.setButtonText('Discard and switch')
			.setDestructive()
			.onClick(() => this.answer(true)));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) {
			this.answered = true;
			this.decide(false);
		}
	}

	private answer(confirmed: boolean): void {
		if (this.answered) return;
		this.answered = true;
		this.decide(confirmed);
	}
}

/** Menu fallback when the pane header title is unavailable for inline editing. */
export class RenameSessionModal extends Modal {
	private input?: HTMLInputElement;
	constructor(app: App, private readonly current: string,
		private readonly submit: (title: string) => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Rename conversation');
		this.contentEl.empty();
		this.input = this.contentEl.createEl('input', {
			cls: 'opencode-rename-input',
			type: 'text',
			attr: { 'aria-label': 'Conversation title' },
		});
		this.input.value = this.current;
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', { text: 'Cancel' });
		const rename = actions.createEl('button', { text: 'Rename', cls: 'mod-cta' });
		cancel.addEventListener('click', () => this.close());
		rename.addEventListener('click', () => this.commit());
		this.input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.commit();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				this.close();
			}
		});
		this.input.focus();
		this.input.select();
	}

	onClose(): void { this.contentEl.empty(); }

	private commit(): void {
		const title = this.input?.value.trim() ?? '';
		if (!title) return;
		this.close();
		this.submit(title);
	}
}
