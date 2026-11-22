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
}

/** Pending permission cards and agent forms, diffed by server identity. */
export class ChatInteractionsPanel {
	private readonly forms = new Map<string, FormCard>();
	private signature = '';

	constructor(private readonly container: HTMLElement, private readonly handlers: InteractionPanelHandlers) {}

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
		this.container.empty();
		for (const request of state.permissions) {
			this.container.appendChild(renderPermissionCard(this.container, request,
				{ decide: (decision) => this.handlers.replyPermission(request.id, decision) },
				busy?.kind === 'permission' && busy.id === request.id));
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
				card = new FormCard(this.container, form, this.formCallbacks(form));
				this.forms.set(form.id, card);
			}
			card.update(form, busy?.kind === 'form' && busy.id === form.id);
			this.container.appendChild(card.el);
		}
	}

	dispose(): void {
		for (const form of this.forms.values()) form.dispose();
		this.forms.clear();
		this.signature = '';
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
