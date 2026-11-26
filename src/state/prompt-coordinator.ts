import type { OpenCodeClient, SessionInboxUser, SessionMessageInfo } from '@opencode/client';
import { OpenCodeApiCompatibilityError } from '../opencode/compatibility';

export type PromptPhase = 'sending' | 'admitted' | 'uncertain';

/** One structured file reference sent with a prompt; the server reads the file. */
export interface PromptFile {
	readonly uri: string;
	readonly name?: string;
}

export interface PendingPrompt {
	readonly id: string;
	readonly text: string;
	readonly phase: PromptPhase;
	readonly skillIDs?: readonly string[];
	readonly files?: readonly PromptFile[];
	readonly error?: string;
}

export type PromptErrorCode = 'empty' | 'busy' | 'uncertain' | 'transport';

const messages: Record<PromptErrorCode, string> = {
	empty: 'Enter a message before sending.',
	busy: 'A message is already being submitted. Wait for it to be confirmed.',
	uncertain: 'The previous message has an uncertain result. Reconcile it before sending another message.',
	transport: 'Unable to confirm whether the message was received. Its text was kept; reconcile before retrying.',
};

export class PromptError extends Error {
	constructor(readonly code: PromptErrorCode) {
		super(messages[code]);
		this.name = 'PromptError';
	}
}

/** Stable identity for admission/reconciliation; works without secure-context randomUUID. */
export function createPromptID(): string {
	if (typeof crypto.randomUUID === 'function') return `msg_${crypto.randomUUID()}`;
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
	return `msg_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface MessagePage {
	readonly data: readonly SessionMessageInfo[];
	readonly cursor: { readonly next?: string | null };
}

/** Stable prompt identity and uncertain-send reconciliation. Never replays with a new ID. */
export class PromptCoordinator {
	private current?: PendingPrompt;
	constructor(
		private readonly client: () => Promise<OpenCodeClient>,
		readonly sessionID: string,
		private readonly makeID: () => string = createPromptID,
		private readonly signal?: AbortSignal,
	) {}

	get pending(): PendingPrompt | undefined { return this.current; }

	/** Snapshot evidence is authoritative: a matching ID proves admission. */
	reconcileMessages(messages: readonly { readonly id: string }[]): PendingPrompt | undefined {
		if (this.current && messages.some((message) => message.id === this.current?.id)) {
			this.current = { ...this.current, phase: 'admitted', error: undefined };
		}
		return this.current;
	}

	/**
	 * Applies the prompt admission rules to an operation that has no admission
	 * identity of its own, such as a command. An admitted prompt is settled, so
	 * only a sending or uncertain prompt blocks.
	 */
	assertIdle(): void {
		if (this.current?.phase === 'uncertain') throw new PromptError('uncertain');
		if (this.current?.phase === 'sending') throw new PromptError('busy');
		if (this.current?.phase === 'admitted') this.current = undefined;
	}

	/** One admission at a time. An uncertain prompt must be reconciled or retried explicitly. */
	async send(text: string, skillIDs: readonly string[] = [], files: readonly PromptFile[] = []): Promise<PendingPrompt> {
		if (!text.trim()) throw new PromptError('empty');
		if (this.current?.phase === 'uncertain') throw new PromptError('uncertain');
		// A confirmed prompt is settled; only another unconfirmed admission blocks a new one.
		if (this.current?.phase === 'sending') throw new PromptError('busy');
		if (this.current?.phase === 'admitted') this.current = undefined;
		const prompt: PendingPrompt = { id: this.makeID(), text, phase: 'sending',
			...(skillIDs.length > 0 ? { skillIDs: [...skillIDs] } : {}),
			...(files.length > 0 ? { files: [...files] } : {}) };
		this.current = prompt;
		return this.transmit(prompt);
	}

	/** Query the server before any retry. An admitted prompt is never sent again. */
	async reconcile(): Promise<PendingPrompt | undefined> {
		const prompt = this.current;
		if (!prompt) return undefined;
		const admitted = await this.find(prompt.id);
		if (admitted) {
			this.current = { ...prompt, phase: 'admitted', error: undefined };
		} else if (prompt.phase === 'sending') {
			this.current = { ...prompt, phase: 'uncertain', error: messages.transport };
		}
		return this.current;
	}

	/** Explicit retry of the same identity: no new prompt ID and no duplicate on admission. */
	async retry(): Promise<PendingPrompt> {
		const prompt = this.current;
		if (!prompt) throw new PromptError('transport');
		await this.reconcile();
		if (this.current?.phase === 'admitted') return this.current;
		return this.transmit(this.current ?? prompt);
	}

	/** Never used to dismiss an uncertain prompt; admission remains recoverable. */
	discard(): void {
		if (this.current?.phase !== 'uncertain') this.current = undefined;
	}

	/** Called after an authoritative snapshot has confirmed the result. */
	settle(): void {
		if (this.current?.phase === 'admitted') this.current = undefined;
	}

	private async transmit(prompt: PendingPrompt): Promise<PendingPrompt> {
		this.current = { ...prompt, phase: 'sending', error: undefined };
		try {
			const client = await this.client();
			this.signal?.throwIfAborted();
			const skills = prompt.skillIDs?.map((id) => ({ id }));
			const files = prompt.files?.map((file) => ({
				uri: file.uri,
				...(file.name !== undefined ? { name: file.name } : {}),
			}));
			const inbox = await client.session.prompt({
				sessionID: this.sessionID,
				id: prompt.id,
				text: prompt.text,
				...(skills && skills.length > 0 ? { skills } : {}),
				...(files && files.length > 0 ? { files } : {}),
			}, { signal: this.signal });
			this.checkInbox(inbox, prompt);
			this.current = { ...prompt, phase: 'admitted', error: undefined };
			return this.current;
		} catch (error) {
			if (this.signal?.aborted) throw error;
			this.current = { ...prompt, phase: 'uncertain', error: messages.transport };
			if (error instanceof OpenCodeApiCompatibilityError) throw error;
			throw new PromptError('transport');
		}
	}

	private checkInbox(inbox: SessionInboxUser, prompt: PendingPrompt): void {
		if (!inbox || inbox.id !== prompt.id || inbox.sessionID !== this.sessionID
			|| inbox.type !== 'user' || inbox.payload?.text !== prompt.text) {
			// An acknowledgment for another identity cannot prove this prompt was admitted.
			throw new PromptError('transport');
		}
	}

	private async find(id: string): Promise<boolean> {
		const client = await this.client();
		this.signal?.throwIfAborted();
		// The just-sent message is the newest one; one bounded page is enough for safe reconciliation.
		const page = await client.message.list({
			sessionID: this.sessionID, order: 'desc',
		}, { signal: this.signal }) as MessagePage;
		if (this.signal?.aborted) throw new PromptError('transport');
		return page.data.some((message) => message.id === id);
	}
}
