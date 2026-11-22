import type { ModelRef, V2Event } from '@opencode/client';
import type { ConnectionCoordinator } from '../opencode/connection';
import type { SessionCoordinator, SessionSnapshot } from '../opencode/sessions';
import { SessionError } from '../opencode/sessions';
import { ConnectionError } from '../opencode/errors';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from '../opencode/compatibility';
import { validateEvent } from '../opencode/event-shapes';
import { sameDirectory } from '../opencode/vault-directory';
import { EventIngestion } from './event-ingestion';
import { createPromptID, PromptCoordinator } from './prompt-coordinator';
import { applyInteractionEvent } from './interaction-events';
import { SynchronizationActions } from './synchronization-actions';
import { backoffDelay, clock, defaultPolicy } from './synchronization-model';
import type { Policy, SynchronizationState } from './synchronization-model';

export type { SynchronizationState } from './synchronization-model';
export type { InteractionBusy } from './synchronization-model';

/** Plugin-owned, live-only recovery. Never retries a prompt, decision, or execution. */
export class SynchronizationCoordinator {
	private value: SynchronizationState = { phase: 'inactive', attempt: 0, permissions: [], forms: [] };
	private readonly listeners = new Set<() => void>();
	private controller?: AbortController;
	private ingestion?: EventIngestion;
	private prompt?: PromptCoordinator;
	private retryTimer?: unknown;
	private timeout?: unknown;
	private pending?: Promise<void>;
	private failures = 0;
	private readonly policy: Policy;
	private readonly actions: SynchronizationActions;
	private readonly unsubscribeConnection: () => void;
	constructor(readonly connection: ConnectionCoordinator, readonly sessions: SessionCoordinator,
		policy: Partial<Policy> = {}, private readonly scheduler = clock,
		private readonly promptID: () => string = createPromptID) {
		this.policy = { ...defaultPolicy, ...policy };
		if (Object.values(this.policy).some((n) => !Number.isSafeInteger(n) || n < 1)) throw new Error('Invalid recovery policy');
		this.actions = new SynchronizationActions(this);
		this.unsubscribeConnection = connection.subscribe?.(() => {
			if (this.value.phase === 'inactive' || this.value.phase === 'disposed') return;
			this.publish({ ...this.value });
		}) ?? (() => undefined);
		connection.signal.addEventListener('abort', this.dispose, { once: true });
	}

	get state(): SynchronizationState {
		const base = { ...this.value, connection: this.connection.status };
		if (base.phase !== 'ready') return base;
		const conversation = this.ingestion?.state;
		// Ingestion discards uncertain state immediately, before its scheduled recovery callback.
		if (this.ingestion && !conversation) return { ...base, phase: 'synchronizing', conversation: undefined, permissions: [], forms: [] };
		return { ...base, conversation };
	}
	get canOperate(): boolean { return this.state.phase === 'ready' && this.state.snapshot?.selected !== undefined; }
	assertReady(): void {
		if (!this.canOperate) throw new Error('Conversation is synchronizing. Retry when connected.');
		if (this.value.interactionBusy) throw new Error('Wait for the current decision to finish.');
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}
	open(): Promise<void> {
		if (this.pending) return this.pending;
		if (this.value.phase === 'inactive') return this.start();
		if (this.value.phase === 'ready') { this.cancelAttempt(); return this.start(); }
		return this.pending ?? Promise.resolve();
	}
	/** Explicit retry only; it cannot admit or replay an application operation. */
	retry(): Promise<void> {
		if (this.value.phase === 'disposed') return Promise.resolve();
		if (this.pending) return this.pending;
		this.failures = 0;
		this.cancelAttempt();
		this.connection.invalidate();
		return this.start();
	}

	dispose = (): void => {
		this.cancelAttempt();
		this.unsubscribeConnection();
		this.connection.signal.removeEventListener('abort', this.dispose);
		this.publish({ phase: 'disposed', attempt: this.failures, permissions: [], forms: [] });
		this.listeners.clear();
	};

	/** Server-backed selectors; failures are displayed without blocking the conversation. */
	loadOptions(): Promise<void> {
		return this.actions.loadOptions();
	}

	sendMessage(text: string): Promise<void> {
		return this.actions.sendMessage(text);
	}

	retryPrompt(): Promise<void> {
		return this.actions.retryPrompt();
	}

	/** Explicitly returns an uncertain draft to the composer; never silently resends it. */
	dismissPrompt(): string | undefined {
		return this.actions.dismissPrompt();
	}

	getPrompt(): PromptCoordinator | undefined {
		return this.prompt;
	}

	stop(): Promise<void> {
		return this.actions.stop();
	}

	setAgent(agent: string): Promise<void> {
		return this.actions.setAgent(agent);
	}

	setModel(model: ModelRef): Promise<void> {
		return this.actions.setModel(model);
	}

	replyPermission(requestID: string, decision: 'once' | 'always' | 'reject'): Promise<void> {
		return this.actions.replyPermission(requestID, decision);
	}

	replyForm(formID: string, answer: Readonly<Record<string, string | number | boolean | readonly string[]>>): Promise<void> {
		return this.actions.replyForm(formID, answer);
	}

	cancelForm(formID: string): Promise<void> {
		return this.actions.cancelForm(formID);
	}

	refreshInteractions(): Promise<void> {
		return this.actions.refreshInteractions();
	}

	private start(): Promise<void> {
		if (this.connection.signal.aborted || this.value.phase === 'disposed') return Promise.resolve();
		this.publish({ phase: 'synchronizing', attempt: this.failures, permissions: [], forms: [],
			pendingPrompt: this.prompt?.pending, actionError: this.value.actionError });
		const controller = new AbortController();
		this.controller = controller;
		this.timeout = this.scheduler.set(() => this.fail(controller), this.policy.timeout);
		const pending = this.synchronize(controller).catch((error: unknown) => this.fail(controller, error)).finally(() => {
			if (this.pending === pending) this.pending = undefined;
		});
		this.pending = pending;
		return pending;
	}

	private async synchronize(controller: AbortController): Promise<void> {
		const { signal } = controller;
		const client = await this.connection.connect();
		if (!this.current(controller)) return;
		let connected!: () => void;
		let rejectConnected!: () => void;
		const ready = new Promise<void>((resolve, reject) => { connected = resolve; rejectConnected = () => reject(new Error('Subscription ended')); });
		signal.addEventListener('abort', rejectConnected, { once: true });
		let buffer: V2Event[] = [];
		let characters = 0;
		let overflow = false;
		let live = false;
		let seenConnected = false;
		// Consume immediately, not merely create the lazy iterable. Wait for its actual connection marker.
		const consume = async () => {
			try {
				for await (const event of client.event.subscribe({ signal })) {
					if (!this.current(controller)) return;
					if (event.type === 'server.connected') {
						if (seenConnected) { this.fail(controller); return; }
						seenConnected = true; connected(); continue;
					}
					// The stream spans all projects. Check scope before interpreting
					// forms/tool payloads so another client's unsupported fields cannot
					// disable this vault. The transport already checked the envelope.
					if (!this.possiblyRelevant(event)) continue;
					validateEvent(event);
					if (live) {
						if (this.applyInteraction(event)) continue;
						this.ingestion?.ingest(event);
						continue;
					}
					const size = JSON.stringify(event).length;
					if (buffer.length >= this.policy.maxEvents || size > this.policy.maxCharacters - characters) {
						overflow = true; buffer = []; characters = 0;
					} else if (!overflow) { buffer.push(event); characters += size; }
				}
				this.fail(controller);
			} catch (error) { this.fail(controller, error); }
			finally { rejectConnected(); }
		};
		void consume().catch(() => this.fail(controller));
		try {
			await ready;
			for (let pass = 0; pass < this.policy.snapshotPasses && this.current(controller); pass++) {
				buffer = []; characters = 0; overflow = false;
				const snapshot = await this.sessions.open(signal);
				if (!this.current(controller)) return;
				const location = { directory: this.sessions.vaultRoot };
				// Required selector contracts must succeed before admitting sends or decisions.
				const [agents, models] = await Promise.all([
					client.agent.list({ location }, { signal }), client.model.list({ location }, { signal }),
				]);
				if (!this.current(controller)) return;
				const selected = snapshot.selected;
				const input = selected && { sessionID: selected.id };
				const [active, permissions, forms] = input ? await Promise.all([
					client.session.active({ signal }), client.permission.list(input, { signal }), client.session.form.list(input, { signal }),
				]) : [{}, [], []] as const;
				if (!this.current(controller)) return;
				// No watermark exists in 2.2.2. Never append buffered text to a snapshot: a relevant
				// overlap invalidates the whole pass, including execution and pending interactions.
				if (overflow || buffer.some((event) => this.relevant(event, snapshot))) continue;
				if (selected) {
					const previous = this.prompt;
					this.prompt = previous?.sessionID === selected.id ? previous
						: new PromptCoordinator(() => this.connection.connect(), selected.id, this.promptID, this.connection.signal);
					this.prompt.reconcileMessages(snapshot.messages);
					this.prompt.settle();
					this.ingestion = new EventIngestion(selected.location.directory, selected.id, snapshot.messages,
						() => this.fail(controller), {}, selected.id in active ? 'running' : selected.outcome ?? 'unknown',
						() => { if (this.current(controller)) this.publishReady({}); });
				} else {
					this.prompt = undefined;
					this.ingestion = undefined;
				}
				live = true;
				this.failures = 0;
				this.clearTimeout();
				this.publish({ phase: 'ready', attempt: this.failures, snapshot, permissions, forms,
					pendingPrompt: this.prompt?.pending, actionError: this.value.actionError,
					agents: agents.data.filter((agent) => !agent.hidden && agent.mode !== 'subagent'),
					models: models.data.filter((model) => model.enabled) });
				return;
			}
			throw new Error('Snapshot overlap');
		} finally { signal.removeEventListener('abort', rejectConnected); }
	}

	/**
	 * Live interaction events update their own state without reloading the
	 * transcript. Admission of a queued prompt does need an authoritative message
	 * load, which is a resync rather than a connection failure.
	 */
	private applyInteraction(event: V2Event): boolean {
		const selected = this.value.snapshot?.selected;
		if (!selected) return false;
		const update = applyInteractionEvent(event, selected, this.value);
		if (!update.handled) return false;
		if (update.resync) this.resync();
		else if (update.patch) this.publishReady(update.patch);
		return true;
	}

	recover(): void {
		if (this.connection.signal.aborted || this.value.phase === 'disposed') return;
		this.cancelAttempt();
		this.connection.invalidate();
		void this.start();
	}

	/** Authoritative reload after admission, without counting as a connection failure. */
	private resync(): void {
		this.recover();
	}

	private possiblyRelevant(event: V2Event): boolean {
		const id: unknown = event.type === 'form.created' ? event.data.form?.sessionID
			: 'sessionID' in event.data ? event.data.sessionID : undefined;
		return id !== undefined && id === this.sessions.selectedID && (event.type === 'session.moved'
			|| !event.location || sameDirectory(event.location.directory, this.sessions.vaultRoot));
	}
	private relevant(event: V2Event, snapshot: SessionSnapshot): boolean {
		const selected = snapshot.selected;
		if (!selected) return false;
		const id: unknown = event.type === 'form.created' ? event.data.form?.sessionID
			: 'sessionID' in event.data ? event.data.sessionID : undefined;
		return id === selected.id && (event.type === 'session.moved' || !event.location
			|| sameDirectory(event.location.directory, selected.location.directory));
	}
	private current(controller: AbortController): boolean { return this.controller === controller && !controller.signal.aborted; }
	/** Also gates required API failures encountered by view-owned session actions. */
	rejectIncompatible(error: unknown): boolean {
		if (!(error instanceof OpenCodeApiCompatibilityError)) return false;
		if (this.controller) this.fail(this.controller, error);
		return true;
	}
	private fail(controller: AbortController, error?: unknown): void {
		if (!this.current(controller)) return;
		this.cancelAttempt();
		this.connection.invalidate();
		this.failures++;
		const exhausted = this.failures > this.policy.retries || error instanceof OpenCodeApiCompatibilityError
			|| error instanceof OpenCodeCompatibilityError;
		const delay = backoffDelay(this.policy, this.failures);
		const message = error instanceof ConnectionError || error instanceof OpenCodeCompatibilityError
			|| error instanceof OpenCodeApiCompatibilityError || error instanceof SessionError
			? error.message : 'Unable to synchronize. Retry discovery.';
		this.publish({ phase: exhausted ? 'exhausted' : 'retrying', attempt: this.failures, delay: exhausted ? undefined : delay,
			error: message, permissions: [], forms: [], pendingPrompt: this.prompt?.pending,
			actionError: this.value.actionError });
		if (!exhausted) this.retryTimer = this.scheduler.set(() => {
			this.retryTimer = undefined;
			void this.start();
		}, delay);
	}
	private clearTimeout(): void {
		if (this.timeout !== undefined) this.scheduler.clear(this.timeout);
		this.timeout = undefined;
	}
	private cancelAttempt(): void {
		this.controller?.abort();
		this.controller = undefined;
		this.ingestion?.dispose();
		this.ingestion = undefined;
		this.clearTimeout();
		if (this.retryTimer !== undefined) this.scheduler.clear(this.retryTimer);
		this.retryTimer = undefined;
	}
	publishReady(patch: Partial<SynchronizationState>): void {
		if (this.value.phase !== 'ready') return;
		this.publish({ ...this.value, ...patch });
	}
	private publish(value: SynchronizationState): void {
		this.value = value;
		for (const listener of this.listeners) listener();
	}
}
