import type { OpenCode } from '@opencode/client';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from './compatibility';
import { ConnectionError } from './errors';

/** One lazy attempt shared by all views; a failed attempt can be explicitly retried. */
export class ConnectionCoordinator {
	private attempt?: Promise<ReturnType<typeof OpenCode.make>>;
	private readonly lifetime = new AbortController();
	readonly signal = this.lifetime.signal;
	constructor(private readonly discover = async (signal: AbortSignal) => {
		const { discoverConnection } = await import('./discovery');
		return discoverConnection(undefined, signal);
	}) {}

	connect(): Promise<ReturnType<typeof OpenCode.make>> {
		if (this.signal.aborted) return Promise.reject(new ConnectionError('transport'));
		if (!this.attempt) {
			const attempt: Promise<ReturnType<typeof OpenCode.make>> = Promise.resolve().then(() => {
				if (this.signal.aborted) throw new ConnectionError('transport');
				return this.discover(this.signal);
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

	/** Rediscover after a broken live connection; never start or stop a service. */
	invalidate(): void { this.attempt = undefined; }

	/** Cancel only this plugin's transport, never the shared service or execution. */
	dispose(): void {
		this.lifetime.abort();
		this.attempt = undefined;
	}
}
