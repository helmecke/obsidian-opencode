import { isSessionNotFoundError } from '@opencode/client';
import type { ModelRef, SessionInfo, SessionMessageInfo } from '@opencode/client';
import type { ConnectionCoordinator } from './connection';
import { ConnectionError } from './errors';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from './compatibility';
import { sameDirectory, vaultDirectory } from './vault-directory';

export class SessionError extends Error {
	constructor(message = 'Unable to load conversations. Retry or choose a conversation again.') { super(message); }
}

export interface SessionSnapshot {
	readonly sessions: readonly SessionInfo[];
	readonly selected?: SessionInfo;
	/** Locally named draft before the first turn creates a server session. */
	readonly draftTitle?: string;
	/** Agent and model chosen for a draft; applied when its session is created. */
	readonly draftAgent?: string;
	readonly draftModel?: ModelRef;
	readonly messages: readonly SessionMessageInfo[];
	readonly empty?: 'none' | 'unavailable';
}

/** Plugin-owned snapshots, not a transcript database. No events or automatic retries here. */
export class SessionCoordinator {
	private snapshot: SessionSnapshot = { sessions: [], messages: [], empty: 'none' };
	private queue: Promise<unknown> = Promise.resolve();
	private opening?: Promise<SessionSnapshot>;
	private creating?: Promise<SessionSnapshot>;
	constructor(private readonly connection: ConnectionCoordinator,
		private readonly directory: () => string) {}

	get state(): SessionSnapshot { return this.snapshot; }
	get vaultRoot(): string { return this.directory(); }
	get selectedID(): string | undefined { return this.snapshot.selected?.id; }

	/**
	 * Reopen reloads the in-memory selection's authoritative messages. It never
	 * reads a persisted selection and never creates a session.
	 */
	open(signal: AbortSignal = this.connection.signal, reloadSelection = true): Promise<SessionSnapshot> {
		if (!this.opening) this.opening = this.run(async (root) => {
			const sessions = await this.listAt(root, signal);
			const current = this.snapshot.selected;
			const draft = current ? undefined : {
				...(this.snapshot.draftTitle ? { draftTitle: this.snapshot.draftTitle } : {}),
				...(this.snapshot.draftAgent ? { draftAgent: this.snapshot.draftAgent } : {}),
				...(this.snapshot.draftModel ? { draftModel: this.snapshot.draftModel } : {}),
			};
			this.snapshot = { sessions, messages: [], empty: 'none',
				...(current ? { selected: current } : draft) };
			if (!current || !reloadSelection) return this.snapshot;
			if (!sameDirectory(current.location.directory, root)) return this.unavailable();
			return this.load(root, current.id, signal);
		}).finally(() => { this.opening = undefined; });
		return this.opening;
	}

	/** Start a blank local draft; no server session exists until the first send. */
	beginDraft(): Promise<SessionSnapshot> {
		return this.run(async () => {
			this.snapshot = { sessions: this.snapshot.sessions, messages: [], empty: 'none' };
			return this.snapshot;
		});
	}

	/** Name the current draft locally; this title is applied when the session is created. */
	setDraftTitle(title: string): Promise<SessionSnapshot> {
		const name = title.trim();
		if (!name) return Promise.resolve(this.snapshot);
		return this.run(async () => {
			if (this.snapshot.selected) return this.snapshot;
			this.snapshot = { ...this.snapshot, draftTitle: name };
			return this.snapshot;
		});
	}

	/** Choose the draft's agent; applied when the first message creates the session. */
	setDraftAgent(agent: string): Promise<SessionSnapshot> {
		return this.run(async () => {
			if (this.snapshot.selected) return this.snapshot;
			this.snapshot = { ...this.snapshot, draftAgent: agent };
			return this.snapshot;
		});
	}

	/** Choose the draft's model and variant; applied when the session is created. */
	setDraftModel(model: ModelRef): Promise<SessionSnapshot> {
		return this.run(async () => {
			if (this.snapshot.selected) return this.snapshot;
			this.snapshot = { ...this.snapshot, draftModel: model };
			return this.snapshot;
		});
	}

	/** Fill only the missing draft defaults; a user choice is never replaced. */
	applyDraftDefaults(agent: string | undefined, model: ModelRef | undefined): SessionSnapshot {
		if (this.snapshot.selected) return this.snapshot;
		const draftAgent = this.snapshot.draftAgent ?? agent;
		const draftModel = this.snapshot.draftModel ?? model;
		this.snapshot = { ...this.snapshot,
			...(draftAgent ? { draftAgent } : {}),
			...(draftModel ? { draftModel } : {}) };
		return this.snapshot;
	}

	list(): Promise<readonly SessionInfo[]> { return this.run((root) => this.listAt(root)); }

	select(id: string): Promise<SessionSnapshot> {
		return this.run((root) => this.load(root, id));
	}

	/** Concurrent create actions share one admission; the local draft's title is applied here. */
	create(): Promise<SessionSnapshot> {
		if (!this.creating) this.creating = this.run(async (root) => {
			const client = await this.connection.connect();
			const title = this.snapshot.draftTitle?.trim();
			const agent = this.snapshot.draftAgent;
			const model = this.snapshot.draftModel;
			const session = await client.session.create({
				location: { directory: root },
				...(title ? { title } : {}),
				...(agent ? { agent } : {}),
				...(model ? { model: { id: model.id, providerID: model.providerID,
					...(model.variant ? { variant: model.variant } : {}) } } : {}),
			}, { signal: this.connection.signal });
			this.checkAlive();
			if (!sameDirectory(session.location.directory, root)) return this.unavailable();
			// Publish the admitted selection before message loading, so a failed load
			// cannot make the next reconnect forget which session was created.
			this.snapshot = { sessions: [...this.snapshot.sessions.filter((s) => s.id !== session.id), session],
				selected: session, messages: [] };
			return this.load(root, session.id);
		}).finally(() => { this.creating = undefined; });
		return this.creating;
	}

	/** Rename the selected session on the server, then re-read its confirmed title. */
	rename(title: string): Promise<SessionSnapshot> {
		const name = title.trim();
		if (!name) return Promise.reject(new SessionError('Enter a conversation name.'));
		return this.run(async (root) => {
			const id = this.snapshot.selected?.id;
			if (!id) throw new SessionError();
			const client = await this.connection.connect();
			try {
				await client.session.update({ sessionID: id, title: name }, { signal: this.connection.signal });
			} catch (error) {
				if (error instanceof OpenCodeApiCompatibilityError || isSessionNotFoundError(error)) throw error;
				throw new SessionError('Unable to rename the conversation. Try again.');
			}
			this.checkAlive();
			return this.refreshSelectedAt(root);
		});
	}

	/** Re-read server-confirmed session metadata without reloading the transcript. */
	refreshSelected(): Promise<SessionSnapshot> {
		return this.run((root) => this.refreshSelectedAt(root));
	}

	private async refreshSelectedAt(root: string): Promise<SessionSnapshot> {
		const id = this.snapshot.selected?.id;
		if (!id) return this.snapshot;
		const client = await this.connection.connect();
		const session = await client.session.get({ sessionID: id }, { signal: this.connection.signal });
		this.checkAlive();
		if (!sameDirectory(session.location.directory, root)) return this.unavailable();
		this.snapshot = { ...this.snapshot,
			sessions: this.snapshot.sessions.map((entry) => entry.id === id ? session : entry),
			selected: session };
		return this.snapshot;
	}

	private checkAlive(): void { if (this.connection.signal.aborted) throw new SessionError(); }

	private run<T>(operation: (root: string) => Promise<T>): Promise<T> {
		const pending = this.queue.then(async () => {
			this.checkAlive();
			const root = this.directory();
			vaultDirectory(root); // Reject relative paths; never substitute the vault display name or cwd.
			return operation(root);
		}).catch((error: unknown) => {
			if (error instanceof SessionError || error instanceof ConnectionError
				|| error instanceof OpenCodeCompatibilityError
				|| error instanceof OpenCodeApiCompatibilityError) throw error;
			throw new SessionError();
		});
		this.queue = pending.catch(() => undefined);
		return pending;
	}

	private async listAt(root: string, signal: AbortSignal = this.connection.signal): Promise<SessionInfo[]> {
		const client = await this.connection.connect();
		const sessions: SessionInfo[] = [];
		let cursor: string | undefined;
		const seen = new Set<string>();
		do {
			const page = await client.session.list({ directory: root, cursor, order: 'desc' }, { signal });
			if (signal.aborted) throw new SessionError();
			this.checkAlive();
			for (const session of page.data) {
				// A delegated subagent session is a child of the conversation that started it, not a conversation.
				if (session.parentID) continue;
				if (sameDirectory(session.location.directory, root) && !sessions.some((s) => s.id === session.id)) sessions.push(session);
			}
			cursor = page.cursor.next ?? undefined;
			if (cursor && seen.has(cursor)) throw new SessionError();
			if (cursor) seen.add(cursor);
		} while (cursor);
		return sessions;
	}

	private async unavailable(): Promise<SessionSnapshot> {
		this.checkAlive();
		this.snapshot = { sessions: this.snapshot.sessions, messages: [], empty: 'unavailable' };
		return this.snapshot;
	}

	private async load(root: string, id: string, signal: AbortSignal = this.connection.signal): Promise<SessionSnapshot> {
		const current = this.snapshot.selected;
		this.snapshot = { sessions: this.snapshot.sessions, messages: [],
			...(current ? { selected: current } : {}) };
		const client = await this.connection.connect();
		try {
			let session = await client.session.get({ sessionID: id }, { signal });
			if (signal.aborted) throw new SessionError();
			this.checkAlive();
			if (!sameDirectory(session.location.directory, root)) return this.unavailable();
			const messages: SessionMessageInfo[] = [];
			let cursor: string | undefined;
			const seen = new Set<string>();
			do {
				// A cursor contains its order; the server rejects combining both.
				const page = await client.message.list(cursor ? { sessionID: id, cursor }
					: { sessionID: id, order: 'asc' }, { signal });
				if (signal.aborted) throw new SessionError();
				this.checkAlive();
				messages.push(...page.data);
				cursor = page.cursor.next ?? undefined;
				if (cursor && seen.has(cursor)) throw new SessionError();
				if (cursor) seen.add(cursor);
			} while (cursor);
			// A session can be moved by another client while its messages are being fetched.
			session = await client.session.get({ sessionID: id }, { signal });
			if (signal.aborted) throw new SessionError();
			this.checkAlive();
			if (!sameDirectory(session.location.directory, root)) return this.unavailable();
			this.snapshot = { sessions: this.snapshot.sessions, selected: session, messages };
			return this.snapshot;
		} catch (error) {
			this.checkAlive();
			if (isSessionNotFoundError(error)) return this.unavailable();
			throw error;
		}
	}
}
