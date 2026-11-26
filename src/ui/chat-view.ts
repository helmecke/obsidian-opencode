import { Component, ItemView, MarkdownView, Notice, Scope } from 'obsidian';
import type { Events, Menu, WorkspaceLeaf } from 'obsidian';
import type { FileDiffInfo } from '@opencode/client';
import type { ConnectionCoordinator } from '../opencode/connection';
import { ConnectionError } from '../opencode/errors';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from '../opencode/compatibility';
import { DiffAccessor } from '../opencode/diffs';
import { conversationBounds, isOutsideVaultPath } from '../opencode/diff-bounds';
import { SessionError } from '../opencode/sessions';
import type { SessionCoordinator } from '../opencode/sessions';
import type { SynchronizationCoordinator, SynchronizationState } from '../state/synchronization';
import { ChatRenderer } from './chat-renderer';
import type { ChatViewHandlers } from './chat-renderer';
import { attachmentSources, collectAttachments, noteAttachment } from './composer-attachments';
import type { AttachmentSources, MessageAttachment } from './composer-attachments';
import { SessionDiffReviewModal } from './diff-review-modal';
import { LinkStack } from './link-stack';
import { ConfirmDiscardModal, RenameSessionModal, SessionSwitcherModal } from './session-switcher';

export const CHAT_VIEW_TYPE = 'opencode-chat';

// Obsidian's own views read this setting through `Vault.getConfig`, which is not
// part of the published typings but stays the only source for the value.
interface ConfigurableVault {
	getConfig?(key: string): unknown;
}

interface TabTitleLeaf {
	tabHeaderInnerTitleEl?: HTMLElement;
}

export class ChatView extends ItemView {
	private opening?: Component;
	private renderer?: ChatRenderer;
	private linkStack?: LinkStack;
	private diffs?: DiffAccessor;
	private viewError?: string;
	private loadingOptions = false;
	private titleEditing = false;
	private titleStart = '';
	private titleParentEl?: HTMLElement;
	private titleParentHome?: HTMLElement;
	private titleTransition?: number;
	private parentTrail?: { id: string; title: string };
	private breadcrumbsEl?: HTMLElement;
	private parentCrumbEl?: HTMLElement;
	private parentSeparatorEl?: HTMLElement;
	private lastMarkdownView?: MarkdownView;
	constructor(leaf: WorkspaceLeaf, private readonly connection: ConnectionCoordinator,
		private readonly sessions: SessionCoordinator, private readonly synchronization: SynchronizationCoordinator,
		private readonly showReasoning: () => boolean,
		private readonly autoAttachActiveNote: () => boolean = () => false) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
	}

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return this.displayTitle(); }
	getIcon(): string { return 'message-square'; }

	// Rendered-element accessors keep view tests and integrations off internal fields.
	get statusEl(): HTMLElement | undefined { return this.renderer?.statusElement; }
	get retryButton(): HTMLButtonElement | undefined { return this.renderer?.retryElement; }
	get messagesEl(): HTMLElement | undefined { return this.renderer?.messagesElement; }
	get interactionsEl(): HTMLElement | undefined { return this.renderer?.interactionsElement; }
	get agentSelect(): HTMLSelectElement | undefined { return this.renderer?.agentSelectElement; }
	get modelSelect(): HTMLSelectElement | undefined { return this.renderer?.modelSelectElement; }
	get variantSelect(): HTMLSelectElement | undefined { return this.renderer?.variantSelectElement; }
	get stopButton(): HTMLButtonElement | undefined { return this.renderer?.stopButtonElement; }
	get sendButton(): HTMLButtonElement | undefined { return this.renderer?.sendButtonElement; }
	get composer(): HTMLTextAreaElement | undefined { return this.renderer?.composerElement; }
	get attachButton(): HTMLButtonElement | undefined { return this.renderer?.attachButtonElement; }
	get attachmentElements(): HTMLButtonElement[] { return this.renderer?.attachmentElements ?? []; }
	get title(): string { return this.displayTitle(); }

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
		const linkStack = new LinkStack(this.app, this.leaf);
		this.linkStack = linkStack;
		opening.register(() => {
			if (this.linkStack === linkStack) this.linkStack = undefined;
		});
		const diffs = new DiffAccessor(this.connection);
		this.diffs = diffs;
		opening.register(() => {
			if (this.diffs === diffs) this.diffs = undefined;
		});
		const renderer = new ChatRenderer(this.app, this.handlers(), this.showReasoning, linkStack, diffs);
		this.renderer = renderer;
		renderer.mount(this.contentEl, opening, this.scope!);
		opening.register(this.synchronization.subscribe(() => this.refresh()));
		this.attachTitleHook(opening);
		this.watchEditor(opening);
		this.syncTitle();
		await this.openInitial();
	}

	onClose(): Promise<void> {
		this.closeOpening();
		return Promise.resolve();
	}

	/** Opening chat starts a fresh conversation; reconnecting reloads the selected one. */
	onPaneMenu(menu: Menu, _source: string): void {
		const ready = this.synchronization.state.phase === 'ready';
		menu.addItem((item) => item
			.setTitle('Switch conversation…')
			.setIcon('messages-square')
			.setDisabled(!ready)
			.onClick(() => { void this.openSwitcher(); }));
		menu.addItem((item) => item
			.setTitle('New conversation')
			.setIcon('message-square-plus')
			.setDisabled(!ready)
			.onClick(() => { void this.newConversation(); }));
		menu.addItem((item) => item
			.setTitle('Rename conversation…')
			.setIcon('pencil')
			.setDisabled(!this.synchronization.canCompose || this.readOnly)
			.onClick(() => this.beginTitleRename()));
		menu.addItem((item) => item
			.setTitle('Review changes in this conversation…')
			.setIcon('file-diff')
			.setDisabled(!ready || !this.synchronization.state.snapshot?.selected)
			.onClick(() => this.reviewChanges()));
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
			retryConnection: () => { void this.retryConnection(); },
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
			openSubagent: (childID) => { void this.openSubagent(childID); },
			openDiffFile: (file) => this.openDiffFile(file),
			copyDiff: (patch) => this.copyDiff(patch),
			attachSelection: () => this.attachSelection(),
			attachActiveNote: () => this.attachActiveNote(),
			attachmentSources: () => this.attachmentSources(),
		};
	}

	/** Track the last Markdown editor so attachment stays usable while chat is focused. */
	private watchEditor(opening: Component): void {
		const workspace = this.app.workspace;
		if (typeof workspace.on !== 'function') return;
		opening.registerEvent(workspace.on('active-leaf-change', () => this.refreshComposerSources()));
		opening.registerEvent(workspace.on('editor-change', () => this.refreshComposerSources()));
	}

	private refreshComposerSources(): void {
		// Record the focused editor now, while it is the active view.
		this.activeMarkdownView();
		this.renderer?.refreshComposer();
	}

	/** The active Markdown editor, or the most recent open one; a lone open note is a safe fallback. */
	private activeMarkdownView(): MarkdownView | undefined {
		const workspace = this.app.workspace;
		const current = typeof workspace.getActiveViewOfType === 'function'
			? workspace.getActiveViewOfType(MarkdownView) : null;
		if (current?.file) this.lastMarkdownView = current;
		const leaves = typeof workspace.getLeavesOfType === 'function'
			? workspace.getLeavesOfType('markdown') : undefined;
		const known = current?.file ? current : this.lastMarkdownView;
		if (known?.file && (!leaves || !known.leaf || leaves.includes(known.leaf))) return known;
		if (!leaves) return undefined;
		const open = leaves.map((leaf) => leaf.view)
			.filter((view): view is MarkdownView => view instanceof MarkdownView && Boolean(view.file));
		// With several notes open and no focus history, never guess which one is meant.
		return open.length === 1 ? open[0] : undefined;
	}

	private attachmentSources(): AttachmentSources {
		const view = this.activeMarkdownView();
		return attachmentSources(view?.editor, view?.file);
	}

	/** Snapshot the selected text now so later selection changes cannot alter the message. */
	private attachSelection(): void {
		const view = this.activeMarkdownView();
		const file = view?.file;
		const text = view?.editor.getSelection() ?? '';
		if (!file || !text.trim()) return;
		this.renderer?.attachComposer({ kind: 'selection', text, sourcePath: file.path });
	}

	private attachActiveNote(): void {
		const file = this.activeMarkdownView()?.file;
		if (!file) return;
		const attachment = noteAttachment(file);
		if (attachment) this.renderer?.attachComposer(attachment);
		else this.notifyOversized(file.basename);
	}

	private notifyOversized(name: string): void {
		new Notice(`${name} is larger than 20 MiB and was not attached.`);
	}

	/** Chips plus resolved `[[...]]` references, deduplicated, and optional auto-attach. */
	private collectAttachments(text: string, chips: readonly MessageAttachment[]): MessageAttachment[] {
		const activeNote = this.autoAttachActiveNote() ? this.activeMarkdownView()?.file ?? null : null;
		return collectAttachments(text, chips, {
			resolver: this.app.metadataCache,
			activeNote,
			notify: (message) => { new Notice(message); },
		});
	}

	/** Re-render from the current synchronization state after a plugin setting changes. */
	refreshFromSettings(): void {
		if (!this.opening) return;
		this.renderer?.refresh(this.synchronization.state, this.viewError, this.parentTrail?.title);
	}

	private refresh(): void {
		if (!this.opening) return;
		const state = this.synchronization.state;
		this.syncTitle();
		this.syncBreadcrumbs();
		this.renderer?.refresh(state, this.viewError, this.parentTrail?.title);
		void this.ensureOptions(state);
	}

	private async openInitial(): Promise<void> {
		const opening = this.opening;
		if (!opening) return;
		this.viewError = undefined;
		this.renderer?.setRetryDisabled(true);
		try {
			await this.synchronization.openDraft();
		} catch (error) {
			if (this.opening !== opening) return;
			this.viewError = this.errorMessage(error, 'Unable to start a conversation. Retry discovery.');
		}
		if (this.opening !== opening) return;
		this.refresh();
	}

	private async retryConnection(): Promise<void> {
		const opening = this.opening;
		if (!opening) return;
		this.viewError = undefined;
		this.renderer?.setRetryDisabled(true);
		try {
			await this.synchronization.retry();
		} catch (error) {
			if (this.opening !== opening) return;
			this.viewError = this.errorMessage(error, 'Unable to connect. Retry discovery.');
		}
		if (this.opening !== opening) return;
		this.refresh();
	}

	private async openSwitcher(): Promise<void> {
		if (this.synchronization.state.phase !== 'ready') return;
		new SessionSwitcherModal(this.app,
			() => this.sessions.list(),
			() => this.sessions.selectedID,
			(id) => this.selectConversation(id)).open();
	}

	/** Open the read-only review for the selected conversation; the modal refreshes on every open. */
	reviewChanges(): void {
		const state = this.synchronization.state;
		const session = state.snapshot?.selected;
		if (state.phase !== 'ready' || !session || !this.diffs) {
			new Notice('Open a conversation to review its changes.');
			return;
		}
		const messages = state.conversation?.messages ?? state.snapshot?.messages ?? [];
		const bounds = conversationBounds(messages);
		const diffs = this.diffs;
		new SessionDiffReviewModal(this.app, {
			load: () => diffs.load(session.id, bounds, true),
			open: (file) => this.openDiffFile(file),
			copy: (patch) => this.copyDiff(patch),
		}).open();
	}

	/** A deleted or outside-vault file has no vault target to open. */
	private openDiffFile(file: FileDiffInfo): void {
		if (file.status === 'deleted' || isOutsideVaultPath(file.file)) return;
		const target = this.app.metadataCache.getFirstLinkpathDest(file.file, '');
		if (!target) {
			new Notice('Unable to open this file. It may be outside the vault.');
			return;
		}
		if (this.linkStack) this.linkStack.open(file.file, '');
		else void this.app.workspace.openLinkText(file.file, '', 'tab');
	}

	private async copyDiff(patch: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(patch);
		} catch {
			new Notice('Unable to copy the patch.');
		}
	}

	private async selectConversation(id: string): Promise<void> {
		if (!id || this.synchronization.state.phase !== 'ready') return;
		if (!(await this.discardDraftIfConfirmed())) return;
		this.diffs?.clear();
		this.parentTrail = undefined;
		this.viewError = undefined;
		try {
			await this.sessions.select(id);
			await this.synchronization.open();
		} catch (error) {
			this.synchronization.rejectIncompatible(error);
			this.viewError = this.errorMessage(error, 'Unable to load the conversation. Try again.');
		}
		this.refresh();
	}

	/** Open a subagent child read-only; a failed lookup keeps the parent transcript in place. */
	private async openSubagent(childID: string): Promise<void> {
		if (!childID || this.synchronization.state.phase !== 'ready') return;
		if (!(await this.discardDraftIfConfirmed())) return;
		this.diffs?.clear();
		const parent = this.synchronization.state.snapshot?.selected ?? this.sessions.state.selected;
		const parentTitle = this.displayTitle();
		this.viewError = undefined;
		try {
			await this.sessions.openChild(childID);
			this.parentTrail = parent ? { id: parent.id, title: parentTitle } : undefined;
			await this.synchronization.open();
		} catch (error) {
			this.synchronization.rejectIncompatible(error);
			new Notice(this.errorMessage(error, 'Unable to open the subagent session.'));
		}
		this.refresh();
	}

	private async newConversation(): Promise<void> {
		if (this.synchronization.state.phase !== 'ready') return;
		if (!(await this.discardDraftIfConfirmed())) return;
		this.diffs?.clear();
		this.parentTrail = undefined;
		this.viewError = undefined;
		try {
			await this.synchronization.openDraft();
		} catch (error) {
			this.synchronization.rejectIncompatible(error);
			this.viewError = this.errorMessage(error, 'Unable to start a conversation. Try again.');
		}
		this.refresh();
	}

	private async discardDraftIfConfirmed(): Promise<boolean> {
		const text = this.renderer?.composerText() ?? '';
		const attachments = this.renderer?.composerAttachments() ?? [];
		if (!text.trim() && attachments.length === 0) return true;
		const confirmed = await new Promise<boolean>((resolve) => {
			new ConfirmDiscardModal(this.app, resolve).open();
		});
		if (confirmed) {
			this.renderer?.setComposerText('');
			this.renderer?.clearComposerAttachments();
		}
		return confirmed;
	}

	private async renameConversation(title: string): Promise<void> {
		const name = title.trim();
		if (!name) {
			this.syncTitle();
			return;
		}
		if (!this.sessions.selectedID) {
			await this.sessions.setDraftTitle(name);
			this.synchronization.refreshSession();
			this.syncTitle();
			this.refresh();
			return;
		}
		try {
			await this.sessions.rename(name);
			this.synchronization.refreshSession();
		} catch (error) {
			this.synchronization.rejectIncompatible(error);
			new Notice(this.errorMessage(error, 'Unable to rename the conversation.'));
		}
		this.syncTitle();
		this.refresh();
	}

	private beginTitleRename(): void {
		if (this.readOnly) return;
		const header = this.headerTitleElement();
		if (!header) {
			const current = this.sessions.state.selected?.title ?? this.sessions.state.draftTitle ?? '';
			new RenameSessionModal(this.app, current, (title) => { void this.renameConversation(title); }).open();
			return;
		}
		if (!this.titleEditing) header.focus();
		if (this.titleEditing) this.caretToEnd(header);
	}

	private startTitleEdit(): void {
		if (this.readOnly || this.titleEditing) return;
		this.titleEditing = true;
		this.titleStart = this.displayTitle();
		const parent = this.headerTitleParentElement();
		if (!parent) return;
		this.titleParentEl = parent;
		this.titleParentHome = parent.parentElement ?? undefined;
		this.clearTitleTransition();
		parent.setCssProps({
			'--opencode-breadcrumbs-width': `${parent.clientWidth}px`,
			'--opencode-breadcrumbs-opacity': '1',
		});
		void parent.getBoundingClientRect();
		parent.addClass('is-collapsed');
		parent.setCssProps({ '--opencode-breadcrumbs-width': '0px', '--opencode-breadcrumbs-opacity': '0' });
		this.titleTransition = window.setTimeout(() => {
			this.titleTransition = undefined;
			parent.remove();
			parent.setCssProps({ '--opencode-breadcrumbs-width': '', '--opencode-breadcrumbs-opacity': '' });
			parent.removeClass('is-collapsed');
		}, 150);
	}

	private restoreTitleParent(): void {
		this.clearTitleTransition();
		const parent = this.titleParentEl;
		const home = this.titleParentHome;
		this.titleParentEl = undefined;
		this.titleParentHome = undefined;
		if (!parent || !home) return;
		parent.setCssProps({ '--opencode-breadcrumbs-width': 'auto', '--opencode-breadcrumbs-opacity': '1' });
		if (parent.parentElement !== home) home.prepend(parent);
		const width = parent.clientWidth;
		parent.addClass('is-collapsed');
		parent.setCssProps({ '--opencode-breadcrumbs-width': '0px', '--opencode-breadcrumbs-opacity': '0' });
		void parent.getBoundingClientRect();
		parent.setCssProps({
			'--opencode-breadcrumbs-width': `${width}px`,
			'--opencode-breadcrumbs-opacity': '1',
		});
		this.titleTransition = window.setTimeout(() => {
			this.titleTransition = undefined;
			parent.setCssProps({ '--opencode-breadcrumbs-width': '', '--opencode-breadcrumbs-opacity': '' });
			parent.removeClass('is-collapsed');
		}, 150);
	}

	private clearTitleTransition(): void {
		if (this.titleTransition === undefined) return;
		window.clearTimeout(this.titleTransition);
		this.titleTransition = undefined;
	}

	private handleTitleKey(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== 'Escape') return;
		if (!this.titleEditing) this.startTitleEdit();
		if (event.key === 'Enter') {
			event.preventDefault();
			this.finishTitleEdit(true);
		} else {
			event.preventDefault();
			this.finishTitleEdit(false);
		}
	}

	private finishTitleEdit(commit: boolean): void {
		if (!this.titleEditing) return;
		const header = this.headerTitleElement();
		this.titleEditing = false;
		this.restoreTitleParent();
		if (!header) return;
		const next = header.textContent?.trim() ?? '';
		if (commit && next && next !== this.titleStart) void this.renameConversation(next);
		else this.syncTitle();
		header.blur();
	}

	private caretToEnd(header: HTMLElement): void {
		const selection = header.ownerDocument.getSelection?.();
		if (!selection) return;
		const range = header.ownerDocument.createRange();
		range.selectNodeContents(header);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	private attachTitleHook(opening: Component): void {
		const header = this.headerTitleElement();
		if (!header) return;
		header.addClass('opencode-chat-title');
		header.setAttribute('role', 'textbox');
		header.setAttribute('aria-label', 'Conversation title');
		header.setAttribute('aria-multiline', 'false');
		header.setAttribute('tabindex', '0');
		header.setAttribute('spellcheck', 'false');
		header.setAttribute('contenteditable', 'true');
		opening.registerDomEvent(header, 'focus', () => this.startTitleEdit());
		opening.registerDomEvent(header, 'keydown', (event) => this.handleTitleKey(event));
		opening.registerDomEvent(header, 'blur', () => this.finishTitleEdit(true));
		opening.register(() => {
			this.restoreTitleParent();
			header.removeClass('opencode-chat-title');
			header.removeAttribute('contenteditable');
			header.removeAttribute('tabindex');
			header.removeAttribute('spellcheck');
			header.removeAttribute('role');
			header.removeAttribute('aria-label');
			header.removeAttribute('aria-multiline');
			header.removeAttribute('aria-readonly');
		});
		this.attachBreadcrumbs(opening);
	}

	private attachBreadcrumbs(opening: Component): void {
		const parent = this.headerTitleParentElement();
		if (!parent) return;
		parent.empty();
		parent.addClass('opencode-chat-breadcrumbs');
		this.breadcrumbsEl = parent;
		this.breadcrumb(parent, opening, 'opencode', 'New conversation', () => { void this.newConversation(); });
		parent.createSpan({ cls: 'view-header-breadcrumb-separator', text: '/' });
		this.breadcrumb(parent, opening, 'sessions', 'Switch conversation', () => { void this.openSwitcher(); });
		parent.createSpan({ cls: 'view-header-breadcrumb-separator', text: '/' });
		opening.register(() => {
			parent.empty();
			parent.removeClass('opencode-chat-breadcrumbs');
			this.breadcrumbsEl = undefined;
			this.parentCrumbEl = undefined;
			this.parentSeparatorEl = undefined;
		});
	}

	/** Append the parent conversation only while a delegated child is open. */
	private syncBreadcrumbs(): void {
		const trail = this.readOnly ? this.parentTrail : undefined;
		if (!trail) {
			if (this.parentSeparatorEl) this.parentSeparatorEl.hidden = true;
			if (this.parentCrumbEl) this.parentCrumbEl.hidden = true;
			return;
		}
		const parent = this.breadcrumbsEl;
		const opening = this.opening;
		if (!parent || !opening) return;
		// Created once and toggled, so its activation always returns to the recorded parent.
		this.parentCrumbEl ??= this.breadcrumb(parent, opening, '', 'Return to the parent conversation', () => {
			const recorded = this.parentTrail;
			if (recorded) void this.selectConversation(recorded.id);
		});
		this.parentSeparatorEl ??= parent.createSpan({ cls: 'view-header-breadcrumb-separator', text: '/' });
		this.parentCrumbEl.hidden = false;
		this.parentSeparatorEl.hidden = false;
		this.parentCrumbEl.setText(trail.title);
	}

	private breadcrumb(parent: HTMLElement, opening: Component, text: string, label: string,
		action: () => void): HTMLElement {
		const item = parent.createSpan({ cls: 'view-header-breadcrumb', text,
			attr: { role: 'button', tabindex: '0', 'aria-label': label } });
		opening.registerDomEvent(item, 'click', (event) => {
			event.preventDefault();
			action();
		});
		opening.registerDomEvent(item, 'keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			action();
		});
		return item;
	}

	private headerTitleElement(): HTMLElement | undefined {
		return this.containerEl.querySelector<HTMLElement>('.view-header-title') ?? undefined;
	}

	private headerTitleParentElement(): HTMLElement | undefined {
		return this.containerEl.querySelector<HTMLElement>('.view-header-title-parent') ?? undefined;
	}

	private tabTitleElement(): HTMLElement | undefined {
		return (this.leaf as WorkspaceLeaf & TabTitleLeaf)?.tabHeaderInnerTitleEl;
	}

	private displayTitle(): string {
		const snapshot = this.synchronization.state.snapshot ?? this.sessions.state;
		return snapshot.selected?.title?.trim() || snapshot.draftTitle?.trim() || 'New conversation';
	}

	/** A delegated child carries a parent; it is read-only and cannot be renamed or written to. */
	private get readOnly(): boolean {
		return Boolean(this.synchronization.state.snapshot?.selected?.parentID);
	}

	private syncTitle(): void {
		const title = this.displayTitle();
		const header = this.headerTitleElement();
		if (header && !this.titleEditing) {
			header.setText(title);
			// A delegated child is read-only: its title is not a rename surface.
			header.setAttribute('contenteditable', this.readOnly ? 'false' : 'true');
			header.setAttribute('aria-readonly', this.readOnly ? 'true' : 'false');
			header.setAttribute('tabindex', this.readOnly ? '-1' : '0');
		}
		const tab = this.tabTitleElement();
		if (tab) tab.setText(title);
	}

	private errorMessage(error: unknown, fallback: string): string {
		return error instanceof ConnectionError || error instanceof OpenCodeCompatibilityError
			|| error instanceof OpenCodeApiCompatibilityError || error instanceof SessionError
			? error.message : fallback;
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
		if (this.readOnly) return;
		const text = this.renderer?.composerText() ?? '';
		if (!text.trim()) return;
		const chips = this.renderer?.composerAttachments() ?? [];
		const attachments = this.collectAttachments(text, chips);
		// Only a confirmed prompt or command clears the composer; a failed command
		// keeps its text for the user to inspect or retry manually.
		if (await this.synchronization.sendMessage(text, attachments)) {
			this.renderer?.clearComposerIf(text);
			// Chips clear only with a confirmed prompt admission, never with a command.
			if (this.synchronization.state.pendingPrompt?.phase === 'admitted') {
				this.renderer?.clearComposerAttachmentsIf(chips);
			}
		}
		this.refresh();
	}

	private async retryPrompt(): Promise<void> {
		await this.synchronization.retryPrompt();
		const pending = this.synchronization.state.pendingPrompt;
		if (pending?.phase === 'admitted') {
			this.renderer?.setComposerText('');
			this.renderer?.clearComposerAttachments();
		}
		this.refresh();
	}
}
