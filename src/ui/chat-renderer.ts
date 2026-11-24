import { Component, Notice, setIcon, setTooltip } from 'obsidian';
import type { App, OpenViewState, PaneType, Scope, TFile } from 'obsidian';
import type { ModelRef } from '@opencode/client';
import type { SynchronizationState } from '../state/synchronization';
import { ConversationRenderer } from './conversation';
import type { MarkdownLike } from './conversation';
import { attachLinkRouter, MarkdownBlock, splitInternalLink } from './markdown';
import type { LinkEnvironment } from './markdown';
import { appendTab, LinkStack, reservedNoteLeaf } from './link-stack';
import type { FormValue } from './form-card';
import type { PermissionDecision } from './permission-card';
import { ChatComposer } from './chat-composer';
import { ChatInteractionsPanel } from './chat-interactions-panel';
import { createIconButton, setNativeDisabled } from './native-controls';
import { ComposerSuggest } from './composer-suggest';

const VAULT_ROOT_SOURCE = '';

export interface ChatViewHandlers {
	retryConnection(): void;
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
	loadSkills(): Promise<void>;
	loadCommands(): Promise<void>;
}

/** Owns the chat DOM: element creation, control wiring, and state-to-DOM updates. */
export class ChatRenderer {
	private contentEl?: HTMLElement;
	private opening?: Component;
	private scope?: Scope;
	private state?: SynchronizationState;
	private viewError?: string;
	private statusEl?: HTMLElement;
	private statusIconEl?: HTMLElement;
	private statusTextEl?: HTMLElement;
	private errorEl?: HTMLElement;
	private messagesEl?: HTMLElement;
	private interactions?: ChatInteractionsPanel;
	private composer?: ChatComposer;
	private retryButton?: HTMLButtonElement;
	private conversation?: ConversationRenderer;
	private signatures = { errors: '' };

	constructor(private readonly app: App, private readonly handlers: ChatViewHandlers,
		private readonly showReasoning?: () => boolean, private readonly linkStack?: LinkStack) {}

	get statusElement(): HTMLElement | undefined { return this.statusEl; }
	get retryElement(): HTMLButtonElement | undefined { return this.retryButton; }
	get messagesElement(): HTMLElement | undefined { return this.messagesEl; }
	get interactionsElement(): HTMLElement | undefined { return this.interactions?.element; }
	get agentSelectElement(): HTMLSelectElement | undefined { return this.composer?.agentSelect; }
	get modelSelectElement(): HTMLSelectElement | undefined { return this.composer?.modelSelect; }
	get variantSelectElement(): HTMLSelectElement | undefined { return this.composer?.variantSelect; }
	get stopButtonElement(): HTMLButtonElement | undefined { return this.composer?.stopButton; }
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
		this.signatures = { errors: '' };
		this.contentEl = undefined;
		this.opening = undefined;
		this.scope = undefined;
		this.state = undefined;
		this.statusEl = undefined;
		this.statusIconEl = undefined;
		this.statusTextEl = undefined;
		this.errorEl = undefined;
		this.messagesEl = undefined;
		this.composer = undefined;
		this.retryButton = undefined;
	}

	setRetryDisabled(disabled: boolean): void {
		if (this.retryButton) setNativeDisabled(this.retryButton, disabled);
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
		this.errorEl = this.contentEl.createDiv({ cls: 'opencode-chat-errors' });
		this.messagesEl = this.contentEl.createDiv({ cls: 'opencode-chat-messages markdown-preview-view' });
		this.interactions = new ChatInteractionsPanel(
			this.contentEl.createDiv({ cls: 'opencode-chat-interactions' }), this.handlers);

		this.composer = new ChatComposer(this.contentEl.createDiv({ cls: 'opencode-chat-composer' }), {
			send: () => this.handlers.send(),
			retryPrompt: () => this.handlers.retryPrompt(),
			dismissPrompt: () => this.handlers.dismissPrompt(),
			setAgent: (agent) => this.handlers.setAgent(agent),
			setModel: (model) => this.handlers.setModel(model),
			stop: () => this.handlers.stop(),
		});

		const meta = this.composer.metaElement;
		this.statusEl = meta.createDiv({
			cls: 'opencode-chat-status',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		this.statusIconEl = this.statusEl.createSpan({
			cls: 'opencode-chat-status-icon',
			attr: { 'aria-hidden': 'true' },
		});
		this.statusIconEl.hidden = true;
		this.statusTextEl = this.statusEl.createSpan({
			cls: 'opencode-chat-status-text',
			text: 'Connecting…',
		});
		this.retryButton = createIconButton(meta, {
			icon: 'refresh-cw',
			label: 'Retry discovery',
		});
		setNativeDisabled(this.retryButton, true);
	}

	private attachRendering(opening: Component): void {
		if (!this.messagesEl || !this.contentEl) return;
		this.conversation = new ConversationRenderer(this.messagesEl, {
			createMarkdown: (container): MarkdownLike => new MarkdownBlock(
				{ app: this.app, component: opening, sourcePath: VAULT_ROOT_SOURCE }, container),
			modelLabel: (model) => this.modelLabel(model),
			agentLabel: (agent) => this.agentLabel(agent),
			showReasoning: this.showReasoning,
		});
		const environment: LinkEnvironment = {
			resolve: (linkpath, sourcePath) => this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
			open: (href, sourcePath, paneType) => this.openLink(href, sourcePath, paneType),
			notify: (message) => { new Notice(message); },
		};
		attachLinkRouter(this.messagesEl, VAULT_ROOT_SOURCE, environment, opening);
		if (!this.retryButton || !this.composer) return;
		// AbstractInputSuggest declares an input element but only needs value, events and a rectangle.
		const suggestions = new ComposerSuggest(
			this.app, this.composer.element as unknown as HTMLInputElement, {
				loadSkills: () => this.handlers.loadSkills(),
				getSkills: () => this.state?.skills,
				loadCommands: () => this.handlers.loadCommands(),
				getCommands: () => this.state?.commands,
			},
			() => this.handlers.send());
		opening.register(() => suggestions.dispose());
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
	}

	/**
	 * Route a link by the pointer's pane type. The chat leaf never navigates. A
	 * plain click reuses an existing note tab, preferring one outside the chat's
	 * group; a new tab and a plain click without a note tab are appended to the
	 * chat's own split.
	 */
	private openLink(href: string, sourcePath: string, paneType: PaneType | boolean): void {
		const workspace = this.app.workspace;
		if (paneType === 'split') {
			if (this.linkStack) this.linkStack.open(href, sourcePath);
			else void workspace.openLinkText(href, sourcePath, 'split');
			return;
		}
		if (paneType === 'window') {
			void workspace.openLinkText(href, sourcePath, 'window');
			return;
		}
		const newTab = paneType === 'tab' || paneType === true;
		const file = this.linkFile(href, sourcePath);
		if (!file) {
			void workspace.openLinkText(href, sourcePath, newTab ? 'tab' : false);
			return;
		}
		const chat = this.linkStack?.chatLeaf;
		if (!newTab) {
			const reserved = reservedNoteLeaf(workspace, chat);
			if (reserved) {
				void reserved.openFile(file, this.linkOpenState(href));
				return;
			}
		}
		// A new tab, and a plain click with no reusable note tab, belong to the
		// split that holds the chat, not the last focused split or a new group.
		const leaf = chat ? appendTab(workspace, chat) : undefined;
		if (!leaf) {
			void workspace.openLinkText(href, sourcePath, 'tab');
			return;
		}
		void leaf.openFile(file, this.linkOpenState(href));
	}

	private linkFile(href: string, sourcePath: string): TFile | null {
		const { linkpath } = splitInternalLink(href);
		if (!linkpath) return null;
		try {
			return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		} catch {
			return null;
		}
	}

	private linkOpenState(href: string): OpenViewState {
		const { subpath } = splitInternalLink(href);
		return subpath ? { active: true, eState: { subpath } } : { active: true };
	}

	private updateStatus(): void {
		const state = this.state;
		if (!state || !this.statusEl || !this.retryButton) return;
		const execution = state.conversation?.execution;
		switch (state.phase) {
			case 'ready': {
				if (state.connection?.phase === 'starting') {
					this.setStatus(state.connection.error ? 'Restarting OpenCode…' : 'Starting OpenCode…');
					setNativeDisabled(this.retryButton, true);
					break;
				}
				if (state.connection?.phase === 'failed' && state.connection.error) {
					this.setStatus(state.connection.error);
					setNativeDisabled(this.retryButton, false);
					break;
				}
				const label = `Connected${this.connectionLabel(state)}${execution && execution !== 'unknown' ? ` · ${this.executionLabel(execution)}` : ''}`;
				const icon = execution === 'failed'
					? undefined
					: state.connection?.mode === 'managed' ? 'server' : 'plug';
				this.setStatus(label, icon);
				setNativeDisabled(this.retryButton, false);
				break;
			}
			case 'synchronizing':
				this.setStatus(state.connection?.phase === 'starting'
					? (state.connection.error ? 'Restarting OpenCode…' : 'Starting OpenCode…')
					: state.snapshot ? 'Reconnecting…' : 'Synchronizing conversation…');
				setNativeDisabled(this.retryButton, true);
				break;
			case 'retrying':
				this.setStatus(`${state.error ?? 'Connection lost.'} Retrying in ${state.delay ?? 0} ms…`);
				setNativeDisabled(this.retryButton, true);
				break;
			case 'exhausted':
				this.setStatus(state.error ?? 'Unable to synchronize. Retry discovery.');
				setNativeDisabled(this.retryButton, false);
				break;
			case 'disposed':
				this.setStatus('Plugin disabled.');
				setNativeDisabled(this.retryButton, true);
				break;
			default:
				this.setStatus('Connecting…');
				setNativeDisabled(this.retryButton, false);
		}
	}

	private setStatus(text: string, icon?: string): void {
		if (!this.statusEl || !this.statusIconEl || !this.statusTextEl) return;
		this.statusTextEl.setText(text);
		this.statusEl.toggleClass('is-icon-only', Boolean(icon));
		this.statusIconEl.hidden = !icon;
		if (icon) {
			setIcon(this.statusIconEl, icon);
			setTooltip(this.statusIconEl, text);
		} else {
			this.statusIconEl.empty();
		}
	}

	private connectionLabel(state: SynchronizationState): string {
		return state.connection?.mode === 'managed' ? ' · Managed service'
			: state.connection?.mode === 'shared' ? ' · Shared service' : '';
	}

	private executionLabel(execution: string): string {
		return execution === 'running' ? 'Executing' : execution === 'succeeded' ? 'Answered'
			: execution === 'failed' ? 'Failed' : execution === 'interrupted' ? 'Stopped' : 'Ready';
	}

	/** Resolve display names from the refreshed catalog; fall back to the message's IDs. */
	private modelLabel(model: ModelRef): string {
		const match = this.state?.models?.find((item) =>
			item.providerID === model.providerID && (item.modelID ?? item.id) === model.id);
		return match ? `${match.providerID} · ${match.name}` : `${model.providerID} · ${model.id}`;
	}

	private agentLabel(agent: string): string {
		return this.state?.agents?.find((item) => item.id === agent)?.name || agent;
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
		// A failed command is shown with its retained text in the composer card.
		if (state.actionError && state.actionError !== state.commandError) messages.push(state.actionError);
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
