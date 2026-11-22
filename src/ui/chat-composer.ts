import type { ModelRef } from '@opencode/client';
import type { SynchronizationState } from '../state/synchronization';
import { fillAgentOptions, fillModelOptions, modelValue } from './chat-options';
import { applyCloseBracket, applyComposerEdit, applyOpenBracket, deleteEmptyPair } from './composer-link';
import type { ComposerEdit, ComposerSelection } from './composer-link';
import { createIconButton, setNativeDisabled } from './native-controls';

export interface ComposerHandlers {
	send(): void;
	retryPrompt(): void;
	dismissPrompt(): void;
	setAgent(agent: string): void;
	setModel(model: ModelRef): void;
	stop(): void;
}

/** Unified message card: textarea, agent/model controls, stop/send, and uncertain-send recovery. */
export class ChatComposer {
	private readonly card: HTMLElement;
	private readonly metaEl: HTMLElement;
	private readonly composer: HTMLTextAreaElement;
	private readonly sendButtonEl: HTMLButtonElement;
	private readonly stopButtonEl: HTMLButtonElement;
	private readonly agentSelectEl: HTMLSelectElement;
	private readonly modelSelectEl: HTMLSelectElement;
	private readonly promptActions: HTMLElement;
	private signatures = { agents: '', models: '' };
	private lastState?: SynchronizationState;

	constructor(container: HTMLElement, private readonly handlers: ComposerHandlers) {
		this.card = container.createDiv({ cls: 'opencode-composer-card' });
		this.composer = this.card.createEl('textarea', {
			cls: 'opencode-chat-input',
			attr: {
				rows: '2',
				placeholder: 'Plan, build, or ask. Ctrl/Cmd+Enter sends; Shift+Enter adds a line.',
				'aria-label': 'Message OpenCode',
			},
		});
		const toolbar = this.card.createDiv({ cls: 'opencode-composer-toolbar' });
		const start = toolbar.createDiv({ cls: 'opencode-composer-toolbar-start' });
		this.metaEl = start.createDiv({ cls: 'opencode-composer-meta' });

		const end = toolbar.createDiv({ cls: 'opencode-composer-toolbar-end' });
		this.agentSelectEl = this.createSelect(end, 'Agent');
		this.modelSelectEl = this.createSelect(end, 'Model');
		this.sendButtonEl = createIconButton(end, {
			icon: 'arrow-up',
			label: 'Send message',
			className: 'opencode-composer-send',
		});
		this.stopButtonEl = createIconButton(end, {
			icon: 'square',
			label: 'Stop execution',
			className: 'opencode-composer-stop',
		});
		this.stopButtonEl.hidden = true;
		setNativeDisabled(this.stopButtonEl, true);
		this.promptActions = this.card.createDiv({ cls: 'opencode-chat-prompt-actions' });

		this.sendButtonEl.addEventListener('click', () => this.handlers.send());
		this.stopButtonEl.addEventListener('click', () => this.handlers.stop());
		this.agentSelectEl.addEventListener('change', () => {
			const agent = this.agentSelectEl.value;
			if (agent) this.handlers.setAgent(agent);
		});
		this.modelSelectEl.addEventListener('change', () => {
			const model = modelValue(this.modelSelectEl.value);
			if (model) this.handlers.setModel(model);
		});
		this.composer.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				this.handlers.send();
				return;
			}
			this.applyPairingKey(event);
		});
		this.composer.addEventListener('input', () => {
			this.resize();
			this.updateInput();
		});
	}

	get element(): HTMLTextAreaElement { return this.composer; }
	get metaElement(): HTMLElement { return this.metaEl; }
	get sendButton(): HTMLButtonElement { return this.sendButtonEl; }
	get stopButton(): HTMLButtonElement { return this.stopButtonEl; }
	get agentSelect(): HTMLSelectElement { return this.agentSelectEl; }
	get modelSelect(): HTMLSelectElement { return this.modelSelectEl; }
	get text(): string { return this.composer.value; }

	setText(text: string): void {
		this.composer.value = text;
		this.resize();
	}

	clearIf(text: string): void {
		if (this.composer.value !== text) return;
		this.composer.value = '';
		this.resize();
	}

	focus(): void { this.composer.focus(); }

	update(state: SynchronizationState): void {
		this.lastState = state;
		const pending = state.pendingPrompt;
		const running = state.conversation?.execution === 'running';
		this.composer.disabled = state.phase === 'disposed';
		this.stopButtonEl.hidden = !running;
		this.sendButtonEl.hidden = running;
		setNativeDisabled(this.stopButtonEl, state.phase !== 'ready' || !running);
		setNativeDisabled(this.sendButtonEl, state.phase !== 'ready' || !state.snapshot?.selected
			|| state.interactionBusy !== undefined
			|| (pending !== undefined && pending.phase !== 'admitted') || this.composer.value.trim().length === 0);
		this.updateAgentOptions(state);
		this.updateModelOptions(state);
		this.renderPromptActions(state);
	}

	private createSelect(parent: HTMLElement, label: string): HTMLSelectElement {
		const wrapper = parent.createDiv({ cls: 'opencode-composer-select' });
		wrapper.createSpan({ text: label, cls: 'opencode-composer-select-label' });
		return wrapper.createEl('select', { attr: { 'aria-label': label, title: label } });
	}

	private updateAgentOptions(state: SynchronizationState): void {
		const agents = state.agents ?? [];
		const selected = state.snapshot?.selected?.agent ?? '';
		const signature = JSON.stringify([agents.map((agent) => [agent.id, agent.name]), selected, state.phase]);
		if (signature !== this.signatures.agents) {
			this.signatures.agents = signature;
			fillAgentOptions(this.agentSelectEl, agents, selected);
		}
		this.agentSelectEl.disabled = state.phase !== 'ready' || agents.length === 0 || Boolean(state.interactionBusy);
		this.describeSelect(this.agentSelectEl, 'Agent');
	}

	private updateModelOptions(state: SynchronizationState): void {
		const models = state.models ?? [];
		const selected = state.snapshot?.selected?.model;
		const signature = JSON.stringify([models.map((model) => [model.providerID, model.modelID, model.name]),
			selected, state.phase]);
		if (signature !== this.signatures.models) {
			this.signatures.models = signature;
			fillModelOptions(this.modelSelectEl, models, selected);
		}
		this.modelSelectEl.disabled = state.phase !== 'ready' || models.length === 0 || Boolean(state.interactionBusy);
		this.describeSelect(this.modelSelectEl, 'Model');
	}

	private describeSelect(select: HTMLSelectElement, label: string): void {
		const option = select.options[select.selectedIndex];
		const selected = option?.textContent?.trim() ?? '';
		const description = selected ? `${label}: ${selected}` : label;
		select.setAttribute('aria-label', description);
		select.title = description;
	}

	private renderPromptActions(state: SynchronizationState): void {
		const pending = state.pendingPrompt;
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

	private resize(): void {
		this.composer.setCssProps({ '--opencode-composer-input-height': 'auto' });
		const scrollHeight = this.composer.scrollHeight;
		// Hidden or unmounted views report zero and must keep the CSS-defined height.
		if (!scrollHeight) return;
		const viewport = this.composer.ownerDocument.defaultView?.innerHeight ?? 0;
		const maxHeight = viewport > 0 ? viewport * 0.4 : scrollHeight;
		const height = Math.min(scrollHeight, maxHeight);
		this.composer.setCssProps({ '--opencode-composer-input-height': `${height}px` });
		this.composer.toggleClass('is-scrollable', scrollHeight > height);
	}

	private updateInput(): void {
		const state = this.lastState;
		if (state) this.update(state);
	}

	private applyPairingKey(event: KeyboardEvent): void {
		if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
		const state: ComposerSelection = {
			value: this.composer.value,
			selectionStart: this.composer.selectionStart,
			selectionEnd: this.composer.selectionEnd,
		};
		let edit: ComposerEdit | null;
		if (event.key === '[') edit = applyOpenBracket(state);
		else if (event.key === ']') edit = applyCloseBracket(state);
		else if (event.key === 'Backspace') edit = deleteEmptyPair(state);
		else return;
		if (!edit) return;
		event.preventDefault();
		applyComposerEdit(this.composer, edit);
		// Programmatic edits bypass the native input event; keep resize and send state in sync.
		this.composer.dispatchEvent(new Event('input', { bubbles: true }));
	}
}
