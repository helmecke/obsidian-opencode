import type { SynchronizationState } from '../state/synchronization';

export interface ComposerHandlers {
	send(): void;
	retryPrompt(): void;
	dismissPrompt(): void;
}

/** Multiline composer, send control, and recoverable uncertain-send actions. */
export class ChatComposer {
	private readonly composer: HTMLTextAreaElement;
	private readonly sendButtonEl: HTMLButtonElement;
	private readonly promptActions: HTMLElement;

	constructor(container: HTMLElement, private readonly handlers: ComposerHandlers) {
		this.composer = container.createEl('textarea', {
			cls: 'opencode-chat-input',
			attr: { rows: '3', placeholder: 'Message OpenCode. Ctrl/Cmd+Enter sends; Shift+Enter adds a line.', 'aria-label': 'Message OpenCode' },
		});
		const actions = container.createDiv({ cls: 'opencode-chat-composer-actions' });
		this.sendButtonEl = actions.createEl('button', { text: 'Send', cls: 'mod-cta' });
		this.promptActions = container.createDiv({ cls: 'opencode-chat-prompt-actions' });
		this.sendButtonEl.addEventListener('click', () => this.handlers.send());
		this.composer.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
			event.preventDefault();
			this.handlers.send();
		});
		this.composer.addEventListener('input', () => this.updateInput());
	}

	get element(): HTMLTextAreaElement { return this.composer; }
	get sendButton(): HTMLButtonElement { return this.sendButtonEl; }
	get text(): string { return this.composer.value; }

	setText(text: string): void { this.composer.value = text; }
	clearIf(text: string): void { if (this.composer.value === text) this.composer.value = ''; }
	focus(): void { this.composer.focus(); }

	update(state: SynchronizationState): void {
		this.lastState = state;
		const pending = state.pendingPrompt;
		this.composer.disabled = state.phase === 'disposed';
		this.sendButtonEl.disabled = state.phase !== 'ready' || !state.snapshot?.selected
			|| state.interactionBusy !== undefined
			|| (pending !== undefined && pending.phase !== 'admitted') || this.composer.value.trim().length === 0;
		this.promptActions.empty();
		if (pending?.phase === 'uncertain') {
			this.promptActions.createSpan({ text: 'Message not confirmed. Reconcile before retrying.', cls: 'opencode-uncertain' });
			const retry = this.promptActions.createEl('button', { text: 'Reconcile and retry' });
			const edit = this.promptActions.createEl('button', { text: 'Return text to editor' });
			retry.disabled = state.phase !== 'ready';
			retry.addEventListener('click', () => this.handlers.retryPrompt());
			edit.addEventListener('click', () => this.handlers.dismissPrompt());
		} else if (pending) {
			this.promptActions.createSpan({ text: 'Message accepted. Awaiting the conversation update.', cls: 'opencode-muted' });
		}
	}

	private updateInput(): void {
		const state = this.lastState;
		if (state) this.update(state);
	}

	private lastState?: SynchronizationState;
}
