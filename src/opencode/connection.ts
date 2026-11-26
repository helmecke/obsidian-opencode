import type { OpenCode } from '@opencode/client';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from './compatibility';
import { ConnectionError } from './errors';

type Client = ReturnType<typeof OpenCode.make>;

export type ConnectionMode = 'unknown' | 'shared' | 'managed';
export type ConnectionPhase = 'idle' | 'discovering' | 'starting' | 'running' | 'failed';
export interface ConnectionStatus {
	readonly mode: ConnectionMode;
	readonly phase: ConnectionPhase;
	readonly error?: string;
}

/** The subset of ManagedRuntime used here; tests can supply a small stand-in. */
export interface ManagedRuntimeLike {
	readonly enabled: boolean;
	readonly status: { readonly phase: 'idle' | 'starting' | 'running' | 'restarting' | 'failed'; readonly error?: string };
	acquire(signal?: AbortSignal): Promise<Client>;
	dispose(): void | Promise<void>;
	subscribe?(listener: () => void): () => void;
}

const safeMessage = (error: unknown): string | undefined =>
	error instanceof ConnectionError || error instanceof OpenCodeCompatibilityError
		|| error instanceof OpenCodeApiCompatibilityError ? error.message : undefined;

/** One lazy attempt shared by all views; a failed attempt can be explicitly retried. */
export class ConnectionCoordinator {
	private attempt?: Promise<Client>;
	private readonly lifetime = new AbortController();
	private statusValue: ConnectionStatus = { mode: 'unknown', phase: 'idle' };
	private readonly listeners = new Set<() => void>();
	readonly signal = this.lifetime.signal;
	constructor(private readonly discover = async (signal: AbortSignal) => {
		const { discoverConnection } = await import('./discovery');
		return discoverConnection(undefined, signal);
	}, private readonly runtime?: ManagedRuntimeLike) {
		runtime?.subscribe?.(() => this.syncRuntimeStatus());
	}

	get status(): ConnectionStatus { return this.statusValue; }

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	connect(): Promise<Client> {
		if (this.signal.aborted) return Promise.reject(new ConnectionError('transport'));
		if (!this.attempt) {
			const attempt: Promise<Client> = Promise.resolve().then(() => {
				if (this.signal.aborted) throw new ConnectionError('transport');
				return this.resolve(this.signal);
			}).then((client) => {
				if (this.signal.aborted) throw new ConnectionError('transport');
				return client;
			}).catch((error: unknown) => {
				if (this.attempt === attempt) this.attempt = undefined;
				if (error instanceof ConnectionError || error instanceof OpenCodeCompatibilityError
					|| error instanceof OpenCodeApiCompatibilityError) throw error;
				throw new ConnectionError('transport');
			});
			this.attempt = attempt;
		}
		return this.attempt;
	}

	/** Rediscover after a broken live connection; never stop a shared service. */
	invalidate(): void { this.attempt = undefined; }

	/** Cancel only this plugin's transport and stop a plugin-owned runtime. */
	dispose(): void {
		this.lifetime.abort();
		this.attempt = undefined;
		void Promise.resolve(this.runtime?.dispose()).catch(() => undefined);
	}

	private async resolve(signal: AbortSignal): Promise<Client> {
		this.setStatus({ mode: 'unknown', phase: 'discovering' });
		try {
			const client = await this.discover(signal);
			this.setStatus({ mode: 'shared', phase: 'running' });
			return client;
		} catch (error) {
			if (!this.runtime || !this.runtime.enabled || !this.launchable(error)) {
				this.setStatus({ mode: this.statusValue.mode, phase: 'failed', error: safeMessage(error) });
				throw error;
			}
			this.setStatus({ mode: 'managed', phase: 'starting' });
			try {
				const client = await this.runtime.acquire(signal);
				this.setStatus({ mode: 'managed', phase: 'running' });
				return client;
			} catch (managedError) {
				this.setStatus({ mode: 'managed', phase: 'failed', error: safeMessage(managedError) });
				throw managedError;
			}
		}
	}

	/** Only true absence or a registration whose process is gone may launch. */
	private launchable(error: unknown): boolean {
		return error instanceof ConnectionError && (error.code === 'absent' || error.code === 'stale');
	}

	private syncRuntimeStatus(): void {
		const runtime = this.runtime;
		if (!runtime || this.statusValue.mode !== 'managed') return;
		switch (runtime.status.phase) {
			case 'starting':
			case 'restarting':
				this.setStatus({ mode: 'managed', phase: 'starting', error: runtime.status.error });
				break;
			case 'running':
				this.setStatus({ mode: 'managed', phase: 'running' });
				break;
			case 'failed':
				this.setStatus({ mode: 'managed', phase: 'failed', error: runtime.status.error });
				break;
			default:
				break;
		}
	}

	private setStatus(status: ConnectionStatus): void {
		this.statusValue = status;
		for (const listener of this.listeners) listener();
	}
}
