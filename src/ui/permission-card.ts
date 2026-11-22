import type { PermissionRequest } from '@opencode/client';

export type PermissionDecision = 'once' | 'always' | 'reject';

export interface PermissionCallbacks {
	decide(decision: PermissionDecision): void;
}

export function renderPermissionCard(container: HTMLElement, request: PermissionRequest,
	callbacks: PermissionCallbacks, busy = false): HTMLElement {
	const card = container.createDiv({ cls: 'opencode-permission' });
	card.createEl('h3', { text: 'Permission required' });
	card.createEl('p', { text: request.action, cls: 'opencode-permission-action' });
	if (request.message) card.createEl('p', { text: request.message, cls: 'opencode-muted' });
	if (request.resources.length) {
		const list = card.createEl('ul', { cls: 'opencode-permission-resources' });
		for (const resource of request.resources) list.createEl('li', { text: resource });
	}
	const save = request.save ?? [];
	if (save.length) {
		card.createEl('p', {
			text: `Persistent approval would save access for: ${save.join(', ')}`,
			cls: 'opencode-permission-scope',
		});
	}
	const actions = card.createDiv({ cls: 'opencode-permission-actions' });
	const once = actions.createEl('button', { text: 'Allow once', cls: 'mod-cta' });
	const always = actions.createEl('button', { text: 'Always allow' });
	const reject = actions.createEl('button', { text: 'Reject' });
	always.disabled = busy || save.length === 0;
	always.title = save.length === 0 ? 'The server did not provide a persistent scope for this request.' : '';
	once.disabled = busy;
	reject.disabled = busy;
	once.addEventListener('click', () => { if (!busy) callbacks.decide('once'); });
	always.addEventListener('click', () => { if (!busy && save.length) callbacks.decide('always'); });
	reject.addEventListener('click', () => { if (!busy) callbacks.decide('reject'); });
	return card;
}
