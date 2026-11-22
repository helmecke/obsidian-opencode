import type { ModelRef } from '@opencode/client';
import type { ConnectionCoordinator } from '../opencode/connection';
import type { SessionCoordinator } from '../opencode/sessions';
import { PromptError } from './prompt-coordinator';
import type { PromptCoordinator } from './prompt-coordinator';
import { actionMessages } from './synchronization-model';
import type { SynchronizationState } from './synchronization-model';

/** The coordinator surface these server actions need contractually. */
export interface SynchronizationActionHost {
	readonly connection: ConnectionCoordinator;
	readonly sessions: SessionCoordinator;
	readonly state: SynchronizationState;
	readonly canOperate: boolean;
	assertReady(): void;
	getPrompt(): PromptCoordinator | undefined;
	publishReady(patch: Partial<SynchronizationState>): void;
	rejectIncompatible(error: unknown): boolean;
	recover(): void;
}

/** Server-backed selectors, execution and interaction actions. */
export class SynchronizationActions {
	constructor(private readonly host: SynchronizationActionHost) {}

	/** Server-backed selectors; failures are displayed without blocking the conversation. */
	async loadOptions(): Promise<void> {
		this.host.assertReady();
		try {
			const client = await this.host.connection.connect();
			const signal = this.host.connection.signal;
			const [agents, models] = await Promise.all([
				client.agent.list({ location: { directory: this.host.sessions.vaultRoot } }, { signal }),
				client.model.list({ location: { directory: this.host.sessions.vaultRoot } }, { signal }),
			]);
			if (!this.host.canOperate) return;
			this.host.publishReady({
				agents: agents.data.filter((agent) => !agent.hidden && agent.mode !== 'subagent'),
				models: models.data.filter((model) => model.enabled),
				optionsError: undefined,
			});
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			if (this.host.canOperate) this.host.publishReady({ optionsError: actionMessages.options });
		}
	}

	async sendMessage(text: string): Promise<void> {
		try {
			this.host.assertReady();
		} catch {
			this.host.publishReady({ actionError: 'Wait until the conversation is synchronized and pending decisions are settled.' });
			return;
		}
		const prompt = this.host.getPrompt();
		if (!prompt) return;
		try {
			await prompt.send(text);
			this.host.publishReady({ pendingPrompt: prompt.pending, actionError: undefined });
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			this.host.publishReady({
				pendingPrompt: prompt.pending,
				actionError: error instanceof PromptError ? error.message : actionMessages.send,
			});
			if (prompt.pending?.phase === 'uncertain') this.host.recover();
		}
	}

	async retryPrompt(): Promise<void> {
		this.host.assertReady();
		const prompt = this.host.getPrompt();
		if (!prompt) return;
		try {
			await prompt.retry();
			this.host.publishReady({ pendingPrompt: prompt.pending, actionError: undefined });
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			this.host.publishReady({
				pendingPrompt: prompt.pending,
				actionError: error instanceof PromptError ? error.message : actionMessages.retry,
			});
		}
		if (prompt.pending?.phase === 'uncertain') this.host.recover();
	}

	/** Explicitly returns an uncertain draft to the composer; never silently resends it. */
	dismissPrompt(): string | undefined {
		const prompt = this.host.getPrompt();
		const text = prompt?.pending?.text;
		prompt?.discard();
		this.host.publishReady({ pendingPrompt: prompt?.pending, actionError: undefined });
		return text;
	}

	async stop(): Promise<void> {
		this.host.assertReady();
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		try {
			const client = await this.host.connection.connect();
			const result = await client.session.interrupt({ sessionID }, { signal: this.host.connection.signal });
			const snapshot = await this.host.sessions.refreshSelected();
			this.host.publishReady({
				snapshot,
				actionError: result.interrupted ? undefined : actionMessages.stop,
			});
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			if (this.host.canOperate) this.host.publishReady({ actionError: actionMessages.stop });
		}
	}

	async setAgent(agent: string): Promise<void> {
		this.host.assertReady();
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		try {
			const client = await this.host.connection.connect();
			await client.session.switchAgent({ sessionID, agent }, { signal: this.host.connection.signal });
			const snapshot = await this.host.sessions.refreshSelected();
			this.host.publishReady({ snapshot, actionError: undefined });
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			if (this.host.canOperate) this.host.publishReady({ actionError: actionMessages.agent });
			this.host.recover();
		}
	}

	async setModel(model: ModelRef): Promise<void> {
		this.host.assertReady();
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		try {
			const client = await this.host.connection.connect();
			await client.session.switchModel({ sessionID, model: {
				id: model.id, providerID: model.providerID,
				...(model.variant ? { variant: model.variant } : {}),
			} }, { signal: this.host.connection.signal });
			const snapshot = await this.host.sessions.refreshSelected();
			this.host.publishReady({ snapshot, actionError: undefined });
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			if (this.host.canOperate) this.host.publishReady({ actionError: actionMessages.model });
			this.host.recover();
		}
	}

	async replyPermission(requestID: string, decision: 'once' | 'always' | 'reject'): Promise<void> {
		this.host.assertReady();
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		this.host.publishReady({ interactionBusy: { kind: 'permission', id: requestID }, actionError: undefined });
		try {
			const client = await this.host.connection.connect();
			await client.permission.reply({ sessionID, requestID, decision }, { signal: this.host.connection.signal });
			// A successful reply is server-confirmed; remove the stale control even if the
			// refresh races the server's own settlement event.
			await this.refreshInteractions();
			this.host.publishReady({
				permissions: this.host.state.permissions.filter((request) => request.id !== requestID),
				interactionBusy: undefined,
			});
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			await this.refreshInteractions().catch(() => undefined);
			this.host.publishReady({ actionError: actionMessages.permission, interactionBusy: undefined });
		}
	}

	async replyForm(formID: string, answer: Readonly<Record<string, string | number | boolean | readonly string[]>>): Promise<void> {
		this.host.assertReady();
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		this.host.publishReady({ interactionBusy: { kind: 'form', id: formID }, actionError: undefined });
		try {
			const client = await this.host.connection.connect();
			await client.session.form.reply({ sessionID, formID, answer },
				{ signal: this.host.connection.signal });
			await this.refreshInteractions();
			this.host.publishReady({
				forms: this.host.state.forms.filter((form) => form.id !== formID),
				interactionBusy: undefined,
			});
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			await this.refreshInteractions().catch(() => undefined);
			this.host.publishReady({ actionError: actionMessages.form, interactionBusy: undefined });
		}
	}

	async cancelForm(formID: string): Promise<void> {
		this.host.assertReady();
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		this.host.publishReady({ interactionBusy: { kind: 'form', id: formID }, actionError: undefined });
		try {
			const client = await this.host.connection.connect();
			await client.session.form.cancel({ sessionID, formID }, { signal: this.host.connection.signal });
			await this.refreshInteractions();
			this.host.publishReady({
				forms: this.host.state.forms.filter((form) => form.id !== formID),
				interactionBusy: undefined,
			});
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			await this.refreshInteractions().catch(() => undefined);
			this.host.publishReady({ actionError: actionMessages.formCancel, interactionBusy: undefined });
		}
	}

	async refreshInteractions(): Promise<void> {
		if (!this.host.canOperate) {
			this.host.publishReady({ interactionBusy: undefined });
			return;
		}
		const sessionID = this.host.state.snapshot?.selected?.id;
		if (!sessionID) return;
		try {
			const client = await this.host.connection.connect();
			const input = { sessionID };
			const [permissions, forms] = await Promise.all([
				client.permission.list(input, { signal: this.host.connection.signal }),
				client.session.form.list(input, { signal: this.host.connection.signal }),
			]);
			const busy = this.host.state.interactionBusy;
			const settled = busy?.kind === 'permission' ? !permissions.some((request) => request.id === busy.id)
				: busy?.kind === 'form' ? !forms.some((form) => form.id === busy.id) : false;
			this.host.publishReady({ permissions, forms, interactionBusy: settled ? undefined : busy });
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			if (this.host.canOperate) this.host.publishReady({ actionError: actionMessages.interactions, interactionBusy: undefined });
		}
	}
}
