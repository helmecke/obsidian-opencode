import type { AgentInfo, ModelInfo, ModelRef, V2Event } from '@opencode/client';
import type { ConnectionCoordinator } from '../opencode/connection';
import type { SessionCoordinator, SessionSnapshot } from '../opencode/sessions';
import { SessionError } from '../opencode/sessions';
import { ConnectionError } from '../opencode/errors';
import { OpenCodeApiCompatibilityError, OpenCodeCompatibilityError } from '../opencode/compatibility';
import { validateEvent } from '../opencode/event-shapes';
import { sameDirectory } from '../opencode/vault-directory';
import { EventIngestion } from './event-ingestion';
import { createPromptID, PromptCoordinator } from './prompt-coordinator';
import type { MessageAttachment } from '../ui/composer-attachments';
import { applyInteractionEvent } from './interaction-events';
import { SynchronizationActions } from './synchronization-actions';
import { backoffDelay, clock, defaultPolicy } from './synchronization-model';
import type { Policy, SynchronizationState } from './synchronization-model';

export type { SynchronizationState } from './synchronization-model';
export type { InteractionBusy } from './synchronization-model';

export interface DraftPreferences {
	/** Last model chosen by the user, used when the default agent has no model. */
	lastModel?(): ModelRef | undefined;
	rememberModel?(model: ModelRef): void;
}

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
	private materializing?: Promise<boolean>;
	private preferences: DraftPreferences = {};
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
	/** A ready draft (or selected session) can compose; an unavailable selection cannot. */
	get canCompose(): boolean {
		if (this.state.phase !== 'ready' || !this.state.snapshot) return false;
		return this.state.snapshot.selected !== undefined || this.state.snapshot.empty !== 'unavailable';
	}

	/** Publish a session metadata change confirmed by the session coordinator. */
	refreshSession(): void {
		this.publishReady({ snapshot: this.sessions.state });
	}

	/** Wire persisted draft preferences (last used model) after construction. */
	useDraftPreferences(preferences: DraftPreferences): void {
		this.preferences = preferences;
	}

	rememberModel(model: ModelRef): void {
		this.preferences.rememberModel?.(model);
	}
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
	/** Opening a chat view starts a blank local draft, not an empty server session. */
	async openDraft(): Promise<void> {
		await this.sessions.beginDraft();
		return this.open();
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

	/** Lazy skill catalog for composer completion; never gates chat. */
	loadSkills(): Promise<void> {
		return this.actions.loadSkills();
	}

	/** Lazy command catalog for composer completion; never gates chat. */
	loadCommands(): Promise<void> {
		return this.actions.loadCommands();
	}

	async sendMessage(text: string, attachments: readonly MessageAttachment[] = []): Promise<boolean> {
		if (!this.sessions.selectedID) {
			const snapshot = this.state.snapshot;
			if (!snapshot || snapshot.empty === 'unavailable') {
				if (this.state.phase === 'ready') {
					this.publishReady({ actionError: 'Select or start a conversation before sending a message.' });
				}
				return false;
			}
			if (!(await this.materializeDraft())) return false;
		}
		return this.actions.sendMessage(text, attachments);
	}

	/** The first turn creates the server session; until then the draft is client-only. */
	private materializeDraft(): Promise<boolean> {
		if (this.materializing) return this.materializing;
		const pending = this.createDraftSession();
		this.materializing = pending;
		return pending;
	}

	private async createDraftSession(): Promise<boolean> {
		try {
			await this.sessions.create();
			await this.open();
			return this.canOperate && this.prompt !== undefined;
		} catch (error) {
			if (this.rejectIncompatible(error)) return false;
			if (this.state.phase === 'ready') {
				this.publishReady({ actionError: 'Unable to start the conversation. Retry.' });
			}
			return false;
		} finally {
			this.materializing = undefined;
		}
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
				let snapshot = await this.sessions.open(signal);
				if (!this.current(controller)) return;
				const location = { directory: this.sessions.vaultRoot };
				// Required selector contracts must succeed before admitting sends or decisions.
				const [agents, models] = await Promise.all([
					client.agent.list({ location }, { signal }), client.model.list({ location }, { signal }),
				]);
				if (!this.current(controller)) return;
				const agentCatalog = agents.data.filter((agent) => !agent.hidden && agent.mode !== 'subagent');
				const modelCatalog = models.data.filter((model) => model.enabled);
				if (!snapshot.selected) {
					snapshot = await this.resolveDraftDefaults(snapshot, client, agentCatalog, modelCatalog, signal);
					if (!this.current(controller)) return;
				}
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
					agents: agentCatalog, models: modelCatalog });
				return;
			}
			throw new Error('Snapshot overlap');
		} finally { signal.removeEventListener('abort', rejectConnected); }
	}

	/**
	 * A draft shows the server's configured default agent and model rather than
	 * placeholder labels. Explicit draft choices are never replaced.
	 */
	private async resolveDraftDefaults(snapshot: SessionSnapshot, client: Awaited<ReturnType<ConnectionCoordinator['connect']>>,
		agents: readonly AgentInfo[], models: readonly ModelInfo[], signal: AbortSignal): Promise<SessionSnapshot> {
		if (snapshot.selected || snapshot.empty === 'unavailable'
			|| (snapshot.draftAgent && snapshot.draftModel)) return snapshot;
		const location = { directory: this.sessions.vaultRoot };
		let agentName: string | undefined;
		let configuredModel: ModelRef | undefined;
		try {
			const config = await client.config.get({ location }, { signal });
			for (const entry of config) {
				if (entry.type !== 'document') continue;
				const info = entry.info;
				if (!info) continue;
				if (typeof info.default_agent === 'string' && info.default_agent.trim()) {
					agentName = info.default_agent.trim();
				}
				configuredModel = this.configuredModelRef(info.model) ?? configuredModel;
			}
		} catch {
			// Defaults are optional; the catalog fallback keeps a draft usable.
		}
		if (signal.aborted) return snapshot;
		let serverModel: ModelRef | undefined;
		try {
			const result = await client.model.default({ location }, { signal });
			serverModel = this.catalogModelRef(result?.data, models);
		} catch {
			// The endpoint is optional; config and catalog fallbacks still apply.
		}
		if (signal.aborted) return snapshot;
		const chosenAgent = (agentName
			? agents.find((agent) => agent.id === agentName || agent.name === agentName) : undefined)
			?? agents.find((agent) => agent.id === 'build' || agent.name.toLowerCase() === 'build') ?? agents[0];
		const remembered = this.usableModelRef(this.preferences.lastModel?.(), models);
		const model = chosenAgent?.model ?? configuredModel ?? remembered ?? serverModel
			?? this.catalogModelRef(models[0], models);
		return this.sessions.applyDraftDefaults(chosenAgent?.id, model);
	}

	private usableModelRef(model: ModelRef | undefined, models: readonly ModelInfo[]): ModelRef | undefined {
		if (!model) return undefined;
		const match = models.find((entry) => entry.providerID === model.providerID
			&& (entry.modelID ?? entry.id) === model.id);
		return match && match.enabled !== false ? model : undefined;
	}

	private configuredModelRef(value: unknown): ModelRef | undefined {
		if (typeof value === 'string') {
			const separator = value.indexOf('/');
			if (separator <= 0 || separator === value.length - 1) return undefined;
			return { providerID: value.slice(0, separator), id: value.slice(separator + 1) };
		}
		if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
		const record = value as Record<string, unknown>;
		if (typeof record.providerID !== 'string' || typeof record.model !== 'string') return undefined;
		return { providerID: record.providerID, id: record.model,
			...(typeof record.variant === 'string' && record.variant ? { variant: record.variant } : {}) };
	}

	private catalogModelRef(value: ModelInfo | null | undefined, models: readonly ModelInfo[]): ModelRef | undefined {
		if (!value) return undefined;
		const providerID = value.providerID;
		const id = value.modelID ?? value.id;
		if (typeof providerID !== 'string' || typeof id !== 'string' || !providerID || !id) return undefined;
		const match = models.find((model) => model.providerID === providerID
			&& (model.modelID ?? model.id) === id);
		if (match?.enabled === false) return undefined;
		return { providerID, id };
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
		else if (update.patch) {
			if (update.patch.snapshot?.selected === undefined) {
				// A deleted selection has no authoritative transcript to project.
				this.ingestion?.dispose();
				this.ingestion = undefined;
				this.prompt = undefined;
			}
			this.publishReady(update.patch);
		}
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
