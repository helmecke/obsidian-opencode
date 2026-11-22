import { Component, Notice } from 'obsidian';
import type { App, Scope } from 'obsidian';
import type { ModelRef } from '@opencode/client';
import type { SynchronizationState } from '../state/synchronization';
import { ConversationRenderer } from './conversation';
import type { MarkdownLike } from './conversation';
import { attachLinkRouter, MarkdownBlock } from './markdown';
import type { LinkEnvironment } from './markdown';
import type { FormValue } from './form-card';
import type { PermissionDecision } from './permission-card';
import { fillAgentOptions, fillModelOptions, modelValue } from './chat-options';
import { ChatComposer } from './chat-composer';
import { ChatInteractionsPanel } from './chat-interactions-panel';

const VAULT_ROOT_SOURCE = '';

export interface ChatViewHandlers {
	retryConnection(): void;
	newConversation(): void;
	chooseConversation(id: string): void;
	send(): void;
	retryPrompt(): void;
	dismissPrompt(): void;
	stop(): void;
	setAgent(agent: string): void;
	setModel(model: ModelRef): void;
	replyPermission(id: string, decision: PermissionDecision): void;
	replyForm(id: string, answer: Record<string, FormValue>): void;
	cancelForm(id: string): void;
	loadOptions(): void;
}

/** Owns the chat DOM: element creation, control wiring, and state-to-DOM updates. */
export class ChatRenderer {
	private contentEl?: HTMLElement;
	private opening?: Component;
	private scope?: Scope;
	private state?: SynchronizationState;
	private viewError?: string;
	private statusEl?: HTMLElement;
	private errorEl?: HTMLElement;
	private conversationSelect?: HTMLSelectElement;
	private newButton?: HTMLButtonElement;
	private agentSelect?: HTMLSelectElement;
	private modelSelect?: HTMLSelectElement;
	private stopButton?: HTMLButtonElement;
	private messagesEl?: HTMLElement;
	private interactions?: ChatInteractionsPanel;
	private composer?: ChatComposer;
	private retryButton?: HTMLButtonElement;
	private conversation?: ConversationRenderer;
	private signatures = { sessions: '', agents: '', models: '', errors: '' };

	constructor(private readonly app: App, private readonly handlers: ChatViewHandlers) {}

	get statusElement(): HTMLElement | undefined { return this.statusEl; }
	get retryElement(): HTMLButtonElement | undefined { return this.retryButton; }
	get messagesElement(): HTMLElement | undefined { return this.messagesEl; }
	get interactionsElement(): HTMLElement | undefined { return this.interactions?.element; }
	get conversationSelectElement(): HTMLSelectElement | undefined { return this.conversationSelect; }
	get agentSelectElement(): HTMLSelectElement | undefined { return this.agentSelect; }
	get modelSelectElement(): HTMLSelectElement | undefined { return this.modelSelect; }
	get newButtonElement(): HTMLButtonElement | undefined { return this.newButton; }
	get stopButtonElement(): HTMLButtonElement | undefined { return this.stopButton; }
	get sendButtonElement(): HTMLButtonElement | undefined { return this.composer?.sendButton; }
	get composerElement(): HTMLTextAreaElement | undefined { return this.composer?.element; }

	mount(contentEl: HTMLElement, opening: Component, scope: Scope): void {
		this.contentEl = contentEl;
		this.opening = opening;
		this.scope = scope;
		this.build();
		this.attachRendering(opening);
	}

	refresh(state: SynchronizationState, viewError?: string): void {
		if (!this.opening) return;
		this.state = state;
		this.viewError = viewError;
		this.updateStatus();
		this.updateConversations();
		this.updateSelectors();
		this.updateMessages();
		this.interactions?.update(state);
		this.composer?.update(state);
		this.updateErrors();
	}

	dispose(): void {
		this.conversation?.dispose();
		this.conversation = undefined;
		this.interactions?.dispose();
		this.interactions = undefined;
		this.signatures = { sessions: '', agents: '', models: '', errors: '' };
		this.contentEl = undefined;
		this.opening = undefined;
		this.scope = undefined;
		this.state = undefined;
		this.statusEl = undefined;
		this.errorEl = undefined;
		this.conversationSelect = undefined;
		this.newButton = undefined;
		this.agentSelect = undefined;
		this.modelSelect = undefined;
		this.stopButton = undefined;
		this.messagesEl = undefined;
		this.composer = undefined;
		this.retryButton = undefined;
	}

	setRetryDisabled(disabled: boolean): void {
		if (this.retryButton) this.retryButton.disabled = disabled;
	}

	composerText(): string {
		return this.composer?.text ?? '';
	}

	clearComposerIf(text: string): void {
		this.composer?.clearIf(text);
	}

	setComposerText(text: string): void {
		this.composer?.setText(text);
	}

	focusComposer(): void {
		this.composer?.focus();
	}

	private build(): void {
		if (!this.contentEl) return;
		const header = this.contentEl.createDiv({ cls: 'opencode-chat-header' });
		const heading = header.createDiv({ cls: 'opencode-chat-heading' });
		heading.createEl('h2', { text: 'OpenCode' });
		this.statusEl = heading.createDiv({ cls: 'opencode-chat-status', text: 'Connecting…' });
		this.retryButton = heading.createEl('button', { text: 'Retry discovery', cls: 'opencode-retry' });
		this.retryButton.disabled = true;
		const selectors = header.createDiv({ cls: 'opencode-chat-selectors' });
		this.agentSelect = this.createSelect(selectors, 'Agent');
		this.modelSelect = this.createSelect(selectors, 'Model');
		this.stopButton = selectors.createEl('button', { text: 'Stop', cls: 'mod-warning' });
		this.stopButton.disabled = true;
		this.stopButton.title = 'Interrupt the active OpenCode execution';

		const conversations = this.contentEl.createDiv({ cls: 'opencode-chat-conversations' });
		this.conversationSelect = this.createSelect(conversations, 'Conversation');
		this.newButton = conversations.createEl('button', { text: 'New conversation' });

		this.errorEl = this.contentEl.createDiv({ cls: 'opencode-chat-errors' });
		this.messagesEl = this.contentEl.createDiv({ cls: 'opencode-chat-messages' });
		this.interactions = new ChatInteractionsPanel(
			this.contentEl.createDiv({ cls: 'opencode-chat-interactions' }), this.handlers);

		this.composer = new ChatComposer(this.contentEl.createDiv({ cls: 'opencode-chat-composer' }), {
			send: () => this.handlers.send(),
			retryPrompt: () => this.handlers.retryPrompt(),
			dismissPrompt: () => this.handlers.dismissPrompt(),
		});
	}

	private createSelect(parent: HTMLElement, label: string): HTMLSelectElement {
		const wrapper = parent.createDiv({ cls: 'opencode-chat-select' });
		wrapper.createSpan({ text: label, cls: 'opencode-chat-select-label' });
		return wrapper.createEl('select', { attr: { 'aria-label': label } });
	}

	private attachRendering(opening: Component): void {
		if (!this.messagesEl || !this.contentEl) return;
		this.conversation = new ConversationRenderer(this.messagesEl, {
			createMarkdown: (container): MarkdownLike => new MarkdownBlock(
				{ app: this.app, component: opening, sourcePath: VAULT_ROOT_SOURCE }, container),
		});
		const environment: LinkEnvironment = {
			resolve: (linkpath, sourcePath) => this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
			open: (href, sourcePath) => { void this.app.workspace.openLinkText(href, sourcePath, true); },
			notify: (message) => { new Notice(message); },
		};
		attachLinkRouter(this.messagesEl, VAULT_ROOT_SOURCE, environment, opening);
		if (!this.retryButton || !this.newButton || !this.stopButton || !this.composer) return;
		// Obsidian's keymap handles trusted shortcuts before DOM bubbling.
		// A view-local scope takes priority without registering a global hotkey.
		const scope = this.scope;
		if (scope) {
			const sendKey = scope.register(['Mod'], 'Enter', (event) => {
				const composer = this.composer?.element;
				if (!composer || composer.ownerDocument.activeElement !== composer) return true;
				if (!event.repeat) this.handlers.send();
				return false;
			});
			opening.register(() => scope.unregister(sendKey));
		}
		opening.registerDomEvent(this.retryButton, 'click', () => this.handlers.retryConnection());
		opening.registerDomEvent(this.newButton, 'click', () => this.handlers.newConversation());
		opening.registerDomEvent(this.stopButton, 'click', () => this.handlers.stop());
		opening.registerDomEvent(this.conversationSelect!, 'change', () => {
			this.handlers.chooseConversation(this.conversationSelect!.value);
		});
		opening.registerDomEvent(this.agentSelect!, 'change', () => {
			const agent = this.agentSelect!.value;
			if (agent) this.handlers.setAgent(agent);
		});
		opening.registerDomEvent(this.modelSelect!, 'change', () => {
			const model = modelValue(this.modelSelect!.value);
			if (model) this.handlers.setModel(model);
		});
	}

	private updateStatus(): void {
		const state = this.state;
		if (!state || !this.statusEl || !this.retryButton) return;
		const execution = state.conversation?.execution;
		switch (state.phase) {
			case 'ready':
				this.statusEl.setText(`Connected${execution && execution !== 'unknown' ? ` · ${this.executionLabel(execution)}` : ''}`);
				this.retryButton.disabled = false;
				break;
			case 'synchronizing':
				this.statusEl.setText(state.snapshot ? 'Reconnecting…' : 'Synchronizing conversation…');
				this.retryButton.disabled = true;
				break;
			case 'retrying':
				this.statusEl.setText(`${state.error ?? 'Connection lost.'} Retrying in ${state.delay ?? 0} ms…`);
				this.retryButton.disabled = true;
				break;
			case 'exhausted':
				this.statusEl.setText(state.error ?? 'Unable to synchronize. Retry discovery.');
				this.retryButton.disabled = false;
				break;
			case 'disposed':
				this.statusEl.setText('Plugin disabled.');
				this.retryButton.disabled = true;
				break;
			default:
				this.statusEl.setText('Connecting…');
				this.retryButton.disabled = false;
		}
		if (this.stopButton) this.stopButton.disabled = state.phase !== 'ready' || execution !== 'running';
	}

	private executionLabel(execution: string): string {
		return execution === 'running' ? 'Executing' : execution === 'succeeded' ? 'Answered'
			: execution === 'failed' ? 'Failed' : execution === 'interrupted' ? 'Stopped' : 'Ready';
	}

	private updateConversations(): void {
		if (!this.state || !this.conversationSelect || !this.newButton) return;
		const state = this.state;
		const sessions = state.snapshot?.sessions ?? [];
		const selected = state.snapshot?.selected?.id ?? '';
		const signature = JSON.stringify([sessions.map((session) => [session.id, session.title ?? '']), selected,
			state.phase === 'ready', state.snapshot?.empty]);
		if (signature !== this.signatures.sessions) {
			this.signatures.sessions = signature;
			this.conversationSelect.empty();
			if (!sessions.length) {
				const empty = this.conversationSelect.createEl('option', { text: state.snapshot?.empty === 'unavailable'
					? 'Saved conversation unavailable' : 'No conversations yet', value: '' });
				empty.selected = true;
			} else {
				if (!selected) this.conversationSelect.createEl('option', { text: 'Choose a conversation', value: '' });
				for (const session of sessions) {
					this.conversationSelect.createEl('option', {
						text: session.title || session.id, value: session.id,
					});
				}
			}
			this.conversationSelect.value = selected;
		}
		this.conversationSelect.disabled = state.phase !== 'ready' || sessions.length === 0;
		this.newButton.disabled = state.phase !== 'ready';
	}

	private updateSelectors(): void {
		const state = this.state;
		if (!state || !this.agentSelect || !this.modelSelect) return;
		const agents = state.agents ?? [];
		const selectedAgent = state.snapshot?.selected?.agent ?? '';
		const agentSignature = JSON.stringify([agents.map((agent) => [agent.id, agent.name]), selectedAgent, state.phase]);
		if (agentSignature !== this.signatures.agents) {
			this.signatures.agents = agentSignature;
			fillAgentOptions(this.agentSelect, agents, selectedAgent);
		}
		this.agentSelect.disabled = state.phase !== 'ready' || agents.length === 0 || Boolean(state.interactionBusy);
		const models = state.models ?? [];
		const selectedModel = state.snapshot?.selected?.model;
		const modelSignature = JSON.stringify([models.map((model) => [model.providerID, model.modelID, model.name]),
			selectedModel, state.phase]);
		if (modelSignature !== this.signatures.models) {
			this.signatures.models = modelSignature;
			fillModelOptions(this.modelSelect, models, selectedModel);
		}
		this.modelSelect.disabled = state.phase !== 'ready' || models.length === 0 || Boolean(state.interactionBusy);
	}

	private updateMessages(): void {
		if (!this.state || !this.conversation || !this.messagesEl) return;
		const nearBottom = this.messagesEl.scrollHeight - this.messagesEl.scrollTop - this.messagesEl.clientHeight < 80;
		this.conversation.render(this.state.conversation?.messages ?? [], this.state.pendingPrompt);
		if (nearBottom) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private updateErrors(): void {
		const state = this.state;
		if (!state || !this.errorEl) return;
		const messages: string[] = [];
		if (state.error && (state.phase === 'retrying' || state.phase === 'exhausted')) messages.push(state.error);
		if (this.viewError) messages.push(this.viewError);
		if (state.actionError) messages.push(state.actionError);
		if (state.optionsError) messages.push(state.optionsError);
		const signature = JSON.stringify([messages, Boolean(state.optionsError)]);
		if (signature === this.signatures.errors) return;
		this.signatures.errors = signature;
		this.errorEl.empty();
		this.errorEl.hidden = messages.length === 0;
		for (const message of messages) this.errorEl.createEl('p', { text: message });
		if (state.optionsError) {
			const retry = this.errorEl.createEl('button', { text: 'Retry agent and model list' });
			retry.addEventListener('click', () => this.handlers.loadOptions());
		}
	}
}
