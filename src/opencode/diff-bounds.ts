import type { SessionMessageAssistant, SessionMessageInfo } from '@opencode/client';

/**
 * Bounds for `session.diff`, whose `from`/`to` are user-message IDs. An absent
 * edge is unbounded (the whole session).
 */
export interface DiffBounds {
	readonly from?: string;
	readonly to?: string;
}

/** The first and last user prompt, bounding the whole conversation's changes. */
export function conversationBounds(messages: readonly SessionMessageInfo[]): DiffBounds {
	const users = messages.filter((message) => message.type === 'user');
	const first = users[0]?.id;
	const last = users[users.length - 1]?.id;
	return { ...(first ? { from: first } : {}), ...(last ? { to: last } : {}) };
}

/** The user prompt that produced a turn; `from`/`to` isolate that one turn. */
export function turnBounds(message: SessionMessageAssistant, messages: readonly SessionMessageInfo[]): DiffBounds {
	const index = messages.findIndex((candidate) => candidate.id === message.id);
	for (let cursor = index - 1; cursor >= 0; cursor--) {
		const candidate = messages[cursor];
		if (candidate?.type === 'user') return { from: candidate.id, to: candidate.id };
	}
	return {};
}

/** A path outside the vault is named but cannot be opened as a vault file. */
export function isOutsideVaultPath(path: string): boolean {
	const normalized = path.replace(/\\/g, '/').trim();
	if (!normalized) return true;
	if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('/') || normalized.startsWith('file:')) return true;
	return normalized.split('/').includes('..');
}
