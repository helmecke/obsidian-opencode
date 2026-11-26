import { isSessionNotFoundError } from '@opencode/client';
import type { FileDiffInfo } from '@opencode/client';
import { translateApiError } from './api-contract';
import { OpenCodeApiCompatibilityError } from './compatibility';
import type { DiffBounds } from './diff-bounds';
import { validateFileDiffs } from './diff-shapes';
import type { ConnectionCoordinator } from './connection';
import { ConnectionError } from './errors';
import { SessionError } from './sessions';

export function diffCacheKey(sessionID: string, bounds: DiffBounds = {}): string {
	return `${sessionID}|${bounds.from ?? ''}|${bounds.to ?? ''}`;
}

/** In-memory only: a view's patches are discarded when it closes or switches conversation. */
export class DiffCache {
	private readonly values = new Map<string, readonly FileDiffInfo[]>();

	get size(): number { return this.values.size; }

	get(sessionID: string, bounds: DiffBounds = {}): readonly FileDiffInfo[] | undefined {
		return this.values.get(diffCacheKey(sessionID, bounds));
	}

	set(sessionID: string, bounds: DiffBounds, diffs: readonly FileDiffInfo[]): void {
		this.values.set(diffCacheKey(sessionID, bounds), diffs);
	}

	clear(): void { this.values.clear(); }
}

type Client = Awaited<ReturnType<ConnectionCoordinator['connect']>>;

/**
 * Read-only access to the service's per-file diffs. The endpoint is optional for
 * compatibility: a failure stays with the review surface and never gates chat.
 */
export class DiffAccessor {
	readonly cache = new DiffCache();
	constructor(private readonly connection: Pick<ConnectionCoordinator, 'connect' | 'signal'>) {}

	clear(): void { this.cache.clear(); }

	async load(sessionID: string, bounds: DiffBounds = {}, refresh = false): Promise<readonly FileDiffInfo[]> {
		if (!refresh) {
			const cached = this.cache.get(sessionID, bounds);
			if (cached) return cached;
		}
		const diffs = await this.fetch(sessionID, bounds);
		this.cache.set(sessionID, bounds, diffs);
		return diffs;
	}

	private async fetch(sessionID: string, bounds: DiffBounds): Promise<readonly FileDiffInfo[]> {
		const client: Client = await this.connection.connect();
		try {
			const value: unknown = await client.session.diff({ sessionID, ...bounds }, { signal: this.connection.signal });
			return validateFileDiffs(value);
		} catch (error) {
			if (isSessionNotFoundError(error)) {
				throw new SessionError('Unable to review changes. The conversation may no longer exist.');
			}
			throw this.translate(error);
		}
	}

	private translate(error: unknown): unknown {
		const translated = translateApiError(error);
		if (translated instanceof ConnectionError || translated instanceof SessionError
			|| translated instanceof OpenCodeApiCompatibilityError) return translated;
		return new ConnectionError('transport');
	}
}
