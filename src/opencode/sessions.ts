import { isSessionNotFoundError } from '@opencode/client';
import type { SessionInfo, SessionMessageInfo } from '@opencode/client';
import type { OpenCodeSettings } from '../settings';
import type { ConnectionCoordinator } from './connection';
import { ConnectionError } from './errors';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from './compatibility';
import { sameDirectory, vaultDirectory } from './vault-directory';

export class SessionError extends Error {
	constructor() { super('Unable to load conversations. Retry or choose a conversation again.'); }
}

export interface SessionSnapshot {
	readonly sessions: readonly SessionInfo[];
	readonly selected?: SessionInfo;
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
		private readonly directory: () => string,
		private readonly settings: OpenCodeSettings,
		private readonly save: () => Promise<void>) {}

	get state(): SessionSnapshot { return this.snapshot; }
	get vaultRoot(): string { return this.directory(); }
	get selectedID(): string | undefined {
		const saved = this.settings.selectedSession;
		return saved && sameDirectory(saved.directory, this.directory()) ? saved.id : undefined;
	}

	/** Reopen always reloads authoritative messages; opening never creates a session. */
	open(signal: AbortSignal = this.connection.signal): Promise<SessionSnapshot> {
		if (!this.opening) this.opening = this.run(async (root) => {
			const sessions = await this.listAt(root, signal);
			this.snapshot = { sessions, messages: [], empty: 'none' };
			const saved = this.settings.selectedSession;
			if (!saved) return this.snapshot;
			if (!sameDirectory(saved.directory, root)) return this.unavailable();
			return this.load(root, saved.id, signal);
		}).finally(() => { this.opening = undefined; });
		return this.opening;
	}

	list(): Promise<readonly SessionInfo[]> { return this.run((root) => this.listAt(root)); }

	select(id: string): Promise<SessionSnapshot> {
		return this.run((root) => this.load(root, id));
	}

	/** Concurrent create actions share one admission; no implicit creation on empty/unavailable state. */
	create(): Promise<SessionSnapshot> {
		if (!this.creating) this.creating = this.run(async (root) => {
			const client = await this.connection.connect();
			const session = await client.session.create({ location: { directory: root } }, { signal: this.connection.signal });
			this.checkAlive();
			if (!sameDirectory(session.location.directory, root)) return this.unavailable();
			// Save confirmed admission before message loading, so a failed load cannot trigger a duplicate on reopen.
			this.settings.selectedSession = { id: session.id, directory: root };
			await this.save();
			this.checkAlive();
			this.snapshot = { sessions: [...this.snapshot.sessions.filter((s) => s.id !== session.id), session], messages: [] };
			return this.load(root, session.id);
		}).finally(() => { this.creating = undefined; });
		return this.creating;
	}

	/** Re-read server-confirmed session metadata without reloading the transcript. */
	refreshSelected(): Promise<SessionSnapshot> {
		return this.run(async (root) => {
			const id = this.snapshot.selected?.id ?? this.selectedID;
			if (!id) return this.snapshot;
			const client = await this.connection.connect();
			const session = await client.session.get({ sessionID: id }, { signal: this.connection.signal });
			this.checkAlive();
			if (!sameDirectory(session.location.directory, root)) return this.unavailable();
			this.snapshot = { ...this.snapshot, selected: session };
			return this.snapshot;
		});
	}

	private checkAlive(): void { if (this.connection.signal.aborted) throw new SessionError(); }

	private run<T>(operation: (root: string) => Promise<T>): Promise<T> {
		const pending = this.queue.then(async () => {
			this.checkAlive();
			const root = this.directory();
			vaultDirectory(root); // Reject relative paths; never substitute the vault display name or cwd.
			return operation(root);
		}).catch((error: unknown) => {
			if (error instanceof ConnectionError || error instanceof OpenCodeCompatibilityError
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
		delete this.settings.selectedSession;
		await this.save();
		this.checkAlive();
		return this.snapshot;
	}

	private async load(root: string, id: string, signal: AbortSignal = this.connection.signal): Promise<SessionSnapshot> {
		this.snapshot = { sessions: this.snapshot.sessions, messages: [] };
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
			this.settings.selectedSession = { id, directory: root };
			await this.save();
			this.checkAlive();
			this.snapshot = { sessions: this.snapshot.sessions, selected: session, messages };
			return this.snapshot;
		} catch (error) {
			this.checkAlive();
			if (isSessionNotFoundError(error)) return this.unavailable();
			throw error;
		}
	}
}
