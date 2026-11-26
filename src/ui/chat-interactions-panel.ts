import { Notice } from 'obsidian';
import type { FormInfo } from '@opencode/client';
import type { SynchronizationState } from '../state/synchronization';
import { FormCard } from './form-card';
import type { FormValue } from './form-card';
import { renderPermissionCard } from './permission-card';
import type { PermissionDecision } from './permission-card';

export interface InteractionPanelHandlers {
	replyPermission(id: string, decision: PermissionDecision): void;
	replyForm(id: string, answer: Record<string, FormValue>): void;
	cancelForm(id: string): void;
	/** Where focus goes when the last pending control disappears. */
	focusComposer?(): void;
}

/** Pending permission cards and agent forms, diffed by server identity. */
export class ChatInteractionsPanel {
	private readonly permissionsEl: HTMLElement;
	private readonly formsEl: HTMLElement;
	private readonly announcer: HTMLElement;
	private readonly forms = new Map<string, FormCard>();
	private knownPermissions = new Set<string>();
	private knownForms = new Set<string>();
	private signature = '';

	constructor(private readonly container: HTMLElement, private readonly handlers: InteractionPanelHandlers) {
		container.addClass('is-empty');
		this.permissionsEl = container.createDiv({ cls: 'opencode-chat-permissions' });
		this.formsEl = container.createDiv({ cls: 'opencode-chat-forms' });
		this.announcer = container.createDiv({
			cls: 'opencode-visually-hidden', attr: { role: 'status', 'aria-live': 'polite' },
		});
	}

	get element(): HTMLElement { return this.container; }

	update(state: SynchronizationState): void {
		const signature = JSON.stringify([
			state.permissions.map((request) => [request.id, request.action, request.resources, request.save, request.message]),
			state.forms.map((form) => [form.id, form.title, form.fields]),
			state.interactionBusy ?? null,
		]);
		const busy = state.interactionBusy;
		if (signature === this.signature) return;
		this.signature = signature;
		const active = this.container.ownerDocument.activeElement;
		const restoreFocus = Boolean(active && this.permissionsEl.contains(active));
		this.permissionsEl.empty();
		for (const request of state.permissions) {
			renderPermissionCard(this.permissionsEl, request,
				{ decide: (decision) => this.handlers.replyPermission(request.id, decision) },
				busy?.kind === 'permission' && busy.id === request.id);
		}
		const ids = new Set(state.forms.map((form) => form.id));
		for (const [id, card] of this.forms) {
			if (ids.has(id)) continue;
			card.dispose();
			this.forms.delete(id);
		}
		for (const form of state.forms) {
			let card = this.forms.get(form.id);
			if (!card) {
				card = new FormCard(this.formsEl, form, this.formCallbacks(form));
				this.forms.set(form.id, card);
			}
			card.update(form, busy?.kind === 'form' && busy.id === form.id);
		}
		this.container.toggleClass('is-empty', state.permissions.length === 0 && state.forms.length === 0);
		this.announce(state);
		if (restoreFocus) this.restoreFocus();
	}

	dispose(): void {
		for (const form of this.forms.values()) form.dispose();
		this.forms.clear();
		this.knownPermissions.clear();
		this.knownForms.clear();
		this.signature = '';
	}

	/** Announce only newly arrived requests, never a busy-state re-render. */
	private announce(state: SynchronizationState): void {
		const permissions = new Set(state.permissions.map((request) => request.id));
		const forms = new Set(state.forms.map((form) => form.id));
		const messages = [
			...state.permissions.filter((request) => !this.knownPermissions.has(request.id))
				.map((request) => `Permission required: ${request.action}`),
			...state.forms.filter((form) => !this.knownForms.has(form.id))
				.map((form) => `Question from OpenCode: ${form.title || 'Agent question'}`),
		];
		this.knownPermissions = permissions;
		this.knownForms = forms;
		if (messages.length) this.announcer.setText(messages.join(' '));
	}

	/** Keep keyboard focus inside the interaction area, or hand it back to the composer. */
	private restoreFocus(): void {
		const next = this.permissionsEl.querySelector<HTMLElement>(
			'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')
			?? this.formsEl.querySelector<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]');
		if (next) next.focus();
		else this.handlers.focusComposer?.();
	}

	private formCallbacks(form: FormInfo): {
		submit(answer: Record<string, FormValue>): void;
		cancel(): void;
		openExternal(url: string): void;
	} {
		return {
			submit: (answer) => this.handlers.replyForm(form.id, answer),
			cancel: () => this.handlers.cancelForm(form.id),
			openExternal: (url) => {
				const opened = window.open(url, '_blank', 'noopener,noreferrer');
				if (!opened) new Notice('Unable to open the external link in a browser.');
			},
		};
	}
}
