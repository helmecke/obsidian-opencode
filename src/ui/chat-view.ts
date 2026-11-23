import { Component, ItemView, Scope } from 'obsidian';
import type { Events, WorkspaceLeaf } from 'obsidian';
import type { ConnectionCoordinator } from '../opencode/connection';
import { ConnectionError } from '../opencode/errors';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from '../opencode/compatibility';
import { SessionError } from '../opencode/sessions';
import type { SessionCoordinator } from '../opencode/sessions';
import type { SynchronizationCoordinator, SynchronizationState } from '../state/synchronization';
import { ChatRenderer } from './chat-renderer';
import type { ChatViewHandlers } from './chat-renderer';

export const CHAT_VIEW_TYPE = 'opencode-chat';

// Obsidian's own views read this setting through `Vault.getConfig`, which is not
// part of the published typings but stays the only source for the value.
interface ConfigurableVault {
	getConfig?(key: string): unknown;
}

export class ChatView extends ItemView {
	private opening?: Component;
	private renderer?: ChatRenderer;
	private viewError?: string;
	private loadingOptions = false;
	constructor(leaf: WorkspaceLeaf, private readonly connection: ConnectionCoordinator,
		private readonly sessions: SessionCoordinator, private readonly synchronization: SynchronizationCoordinator) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
	}

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return 'OpenCode'; }
	getIcon(): string { return 'message-square'; }

	// Rendered-element accessors keep view tests and integrations off internal fields.
	get statusEl(): HTMLElement | undefined { return this.renderer?.statusElement; }
	get retryButton(): HTMLButtonElement | undefined { return this.renderer?.retryElement; }
	get messagesEl(): HTMLElement | undefined { return this.renderer?.messagesElement; }
	get interactionsEl(): HTMLElement | undefined { return this.renderer?.interactionsElement; }
	get conversationSelect(): HTMLSelectElement | undefined { return this.renderer?.conversationSelectElement; }
	get agentSelect(): HTMLSelectElement | undefined { return this.renderer?.agentSelectElement; }
	get modelSelect(): HTMLSelectElement | undefined { return this.renderer?.modelSelectElement; }
	get variantSelect(): HTMLSelectElement | undefined { return this.renderer?.variantSelectElement; }
	get newButton(): HTMLButtonElement | undefined { return this.renderer?.newButtonElement; }
	get stopButton(): HTMLButtonElement | undefined { return this.renderer?.stopButtonElement; }
	get sendButton(): HTMLButtonElement | undefined { return this.renderer?.sendButtonElement; }
	get composer(): HTMLTextAreaElement | undefined { return this.renderer?.composerElement; }

	async onOpen(): Promise<void> {
		this.closeOpening();
		if (this.connection.signal.aborted) return;
		const opening = this.addChild(new Component());
		this.opening = opening;
		opening.register(() => {
			if (this.opening !== opening) return;
			this.opening = undefined;
			this.renderer?.dispose();
			this.renderer = undefined;
			this.contentEl.empty();
			this.contentEl.removeClass('opencode-chat');
		});
		const close = () => { void this.onClose(); };
		this.connection.signal.addEventListener('abort', close, { once: true });
		opening.register(() => this.connection.signal.removeEventListener('abort', close));
		this.contentEl.empty();
		this.contentEl.addClass('opencode-chat');
		this.applyReadableLineWidth();
		this.watchReadableLineWidth(opening);
		const renderer = new ChatRenderer(this.app, this.handlers());
		this.renderer = renderer;
		renderer.mount(this.contentEl, opening, this.scope!);
		opening.register(this.synchronization.subscribe(() => this.refresh()));
		await this.connect(false);
	}

	onClose(): Promise<void> {
		this.closeOpening();
		return Promise.resolve();
	}

	private closeOpening(): void {
		if (this.opening) this.removeChild(this.opening);
		this.contentEl.empty();
		this.contentEl.removeClass('opencode-chat');
		this.contentEl.removeClass('is-readable-line-width');
	}

	/** Mirror Obsidian's readable-line-length setting with its native class. */
	private applyReadableLineWidth(): void {
		const vault = this.app.vault as typeof this.app.vault & ConfigurableVault;
		const enabled = typeof vault.getConfig === 'function'
			? vault.getConfig('readableLineLength') !== false
			: true;
		this.contentEl.toggleClass('is-readable-line-width', enabled);
	}

	private watchReadableLineWidth(opening: Component): void {
		const vault = this.app.vault;
		if (typeof vault.on !== 'function') return;
		// Vault's typed events leave out `config-changed`; the base event API carries it.
		opening.registerEvent((vault as unknown as Events).on('config-changed', (key) => {
			if (key === 'readableLineLength') this.applyReadableLineWidth();
		}));
	}

	private handlers(): ChatViewHandlers {
		return {
			retryConnection: () => { void this.connect(true); },
			newConversation: () => { void this.createConversation(); },
			chooseConversation: (id) => { void this.chooseConversation(id); },
			send: () => { void this.send(); },
			retryPrompt: () => { void this.retryPrompt(); },
			dismissPrompt: () => {
				const text = this.synchronization.dismissPrompt();
				if (text !== undefined) {
					this.renderer?.setComposerText(text);
					this.renderer?.focusComposer();
				}
				this.refresh();
			},
			stop: () => { void this.synchronization.stop(); },
			setAgent: (agent) => { void this.synchronization.setAgent(agent); },
			setModel: (model) => { void this.synchronization.setModel(model); },
			replyPermission: (id, decision) => { void this.synchronization.replyPermission(id, decision); },
			replyForm: (id, answer) => { void this.synchronization.replyForm(id, answer); },
			cancelForm: (id) => { void this.synchronization.cancelForm(id); },
			loadOptions: () => { void this.synchronization.loadOptions(); },
			loadSkills: () => this.synchronization.loadSkills(),
			loadCommands: () => this.synchronization.loadCommands(),
		};
	}

	private refresh(): void {
		if (!this.opening) return;
		const state = this.synchronization.state;
		this.renderer?.refresh(state, this.viewError);
		void this.ensureOptions(state);
	}

	private async connect(manual: boolean): Promise<void> {
		const opening = this.opening;
		if (!opening) return;
		this.viewError = undefined;
		this.renderer?.setRetryDisabled(true);
		try {
			await (manual ? this.synchronization.retry() : this.synchronization.open());
		} catch (error) {
			if (this.opening !== opening) return;
			this.viewError = error instanceof ConnectionError || error instanceof OpenCodeCompatibilityError
				|| error instanceof OpenCodeApiCompatibilityError || error instanceof SessionError
				? error.message : 'Unable to connect. Retry discovery.';
		}
		if (this.opening !== opening) return;
		this.refresh();
	}

	private async chooseConversation(id: string): Promise<void> {
		if (!id || this.synchronization.state.phase !== 'ready') return;
		this.viewError = undefined;
		try {
			await this.sessions.select(id);
			await this.synchronization.open();
		} catch (error) {
			this.synchronization.rejectIncompatible(error);
			this.viewError = error instanceof SessionError || error instanceof OpenCodeApiCompatibilityError
				? error.message : 'Unable to load the conversation. Try again.';
		}
		this.refresh();
	}

	private async createConversation(): Promise<void> {
		if (this.synchronization.state.phase !== 'ready') return;
		this.viewError = undefined;
		try {
			await this.sessions.create();
			await this.synchronization.open();
		} catch (error) {
			this.synchronization.rejectIncompatible(error);
			this.viewError = error instanceof SessionError || error instanceof OpenCodeApiCompatibilityError
				? error.message : 'Unable to create a conversation. Try again.';
		}
		this.refresh();
	}

	private async ensureOptions(state: SynchronizationState): Promise<void> {
		if (state.phase !== 'ready' || this.loadingOptions || state.agents !== undefined || state.optionsError) return;
		this.loadingOptions = true;
		try {
			await this.synchronization.loadOptions();
		} catch {
			// Status and retry affordance are rendered from synchronization state.
		} finally {
			this.loadingOptions = false;
			this.refresh();
		}
	}

	private async send(): Promise<void> {
		const text = this.renderer?.composerText() ?? '';
		if (!text.trim()) return;
		// Only a confirmed prompt or command clears the composer; a failed command
		// keeps its text for the user to inspect or retry manually.
		if (await this.synchronization.sendMessage(text)) this.renderer?.clearComposerIf(text);
		this.refresh();
	}

	private async retryPrompt(): Promise<void> {
		await this.synchronization.retryPrompt();
		const pending = this.synchronization.state.pendingPrompt;
		if (pending?.phase === 'admitted') this.renderer?.setComposerText('');
		this.refresh();
	}
}
