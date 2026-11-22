import type { SessionMessageInfo, V2Event } from '@opencode/client';
import * as timers from 'node:timers';
import { sameDirectory, vaultDirectory } from '../opencode/vault-directory';
import { SessionReducer } from './session-reducer';
import type { ConversationProjection, ExecutionState } from './session-reducer';

export type RecoveryReason = 'queue-overflow' | 'identity-capacity' | 'uncertain-order' | 'unsupported-mutation' | 'stream-ended';
interface Limits { maxEvents: number; maxCharacters: number; maxIdentities: number; batchSize: number }
const defaults: Limits = { maxEvents: 512, maxCharacters: 1024 * 1024, maxIdentities: 8192, batchSize: 64 };

/** Fast transport sink. No DOM, Markdown, network recovery, or subscriber callbacks in ingestion. */
export class EventIngestion {
	private queue: V2Event[] = [];
	private characters = 0;
	private readonly identities = new Set<string>();
	private readonly sequences = new Map<string, number>();
	private reducer?: SessionReducer;
	private timer?: ReturnType<typeof timers.setTimeout>;
	private disposed = false;
	private reason?: RecoveryReason;
	private notified = false;
	private readonly limits: Limits;
	constructor(private readonly directory: string, private readonly sessionID: string,
		messages: readonly SessionMessageInfo[], private readonly requestRecovery: (reason: RecoveryReason) => void,
		limits: Partial<Limits> = {}, execution: ExecutionState = 'unknown',
		private readonly onChange: () => void = () => {}) {
		vaultDirectory(directory);
		this.limits = { ...defaults, ...limits };
		if (Object.values(this.limits).some((n) => !Number.isSafeInteger(n) || n < 1)) throw new Error('Invalid event limits');
		this.reducer = new SessionReducer(messages, execution);
	}

	/** Undefined explicitly gates use of a discarded, uncertain projection. */
	get state(): ConversationProjection | undefined { return this.reducer?.state; }
	get recoveryReason(): RecoveryReason | undefined { return this.reason; }
	get pendingCount(): number { return this.queue.length; }

	ingest(event: V2Event): void {
		if (this.disposed || this.reason || !this.relevant(event)) return;
		if (this.identities.has(event.id)) return;
		if (this.identities.size >= this.limits.maxIdentities) return this.invalidate('identity-capacity');
		const size = JSON.stringify(event).length;
		if (this.queue.length >= this.limits.maxEvents || size > this.limits.maxCharacters - this.characters) {
			return this.invalidate('queue-overflow');
		}
		this.identities.add(event.id);
		this.queue.push(event);
		this.characters += size;
		this.schedule();
	}

	/** Source must use the same subscriber-local signal. No render awaits or reconnect here. */
	async consume(events: AsyncIterable<V2Event>, signal: AbortSignal): Promise<void> {
		try {
			for await (const event of events) {
				if (signal.aborted || this.disposed) return;
				this.ingest(event);
			}
		} finally {
			if (!signal.aborted && !this.disposed) this.invalidate('stream-ended');
		}
	}

	/** Bounded CPU batch; presentation can read state on its own rendering schedule. */
	drain(): void {
		if (this.timer !== undefined) { timers.clearTimeout(this.timer); this.timer = undefined; }
		if (this.disposed) return;
		let changed = false;
		for (let i = 0; i < this.limits.batchSize && this.queue.length && !this.reason; i++) {
			const event = this.queue.shift()!;
			this.characters -= JSON.stringify(event).length;
			if ('durable' in event) {
				const { aggregateID, seq } = event.durable;
				const previous = this.sequences.get(aggregateID);
				// Sequence gaps are not proof of loss: other event types may be filtered upstream.
				if (!Number.isSafeInteger(seq) || (previous !== undefined && seq <= previous)) {
					this.invalidate('uncertain-order'); break;
				}
				this.sequences.set(aggregateID, seq);
			}
			if (!this.reducer?.apply(event)) this.invalidate('unsupported-mutation');
			else changed = true;
		}
		if (this.reason && !this.notified) { this.notified = true; this.requestRecovery(this.reason); }
		if (!this.reason && changed) this.onChange();
		if (this.queue.length) this.schedule();
	}

	dispose(): void {
		this.disposed = true;
		if (this.timer !== undefined) timers.clearTimeout(this.timer);
		this.timer = undefined;
		this.queue = [];
		this.characters = 0;
		this.identities.clear();
		this.sequences.clear();
		this.reducer = undefined;
	}

	private relevant(event: V2Event): boolean {
		const data = event.data;
		const id: unknown = event.type === 'form.created' ? event.data.form.sessionID
			: 'sessionID' in data ? data.sessionID : undefined;
		if (id !== this.sessionID) return false;
		// A move changes the scope itself: it must invalidate even if its envelope names the new location.
		if (event.type === 'session.moved') return true;
		return !event.location || sameDirectory(event.location.directory, this.directory);
	}

	private invalidate(reason: RecoveryReason): void {
		if (this.reason || this.disposed) return;
		this.reason = reason;
		this.reducer = undefined;
		this.queue = [];
		this.characters = 0;
		this.identities.clear();
		this.sequences.clear();
		this.schedule();
	}

	private schedule(): void {
		if (this.timer === undefined && !this.disposed) this.timer = timers.setTimeout(() => this.drain(), 0);
	}
}
