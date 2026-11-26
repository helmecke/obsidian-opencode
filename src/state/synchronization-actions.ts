import type { ModelRef } from '@opencode/client';
import type { ConnectionCoordinator } from '../opencode/connection';
import type { SessionCoordinator } from '../opencode/sessions';
import { composePromptText, noteFiles } from '../ui/composer-attachments';
import type { MessageAttachment } from '../ui/composer-attachments';
import { skillMentions } from '../ui/composer-link';
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
	readonly canCompose: boolean;
	assertReady(): void;
	getPrompt(): PromptCoordinator | undefined;
	rememberModel(model: ModelRef): void;
	publishReady(patch: Partial<SynchronizationState>): void;
	rejectIncompatible(error: unknown): boolean;
	recover(): void;
}

/** A message-leading `/name` token and its argument text. */
interface LeadingCommand {
	readonly name: string;
	readonly arguments: string;
}

/**
 * Splits a message-leading `/name` from its arguments. Only the first
 * whitespace delimiter is removed, so the remaining text is preserved.
 */
function leadingCommand(text: string): LeadingCommand | null {
	const match = /^\/(\S+)/u.exec(text);
	const name = match?.[1];
	if (!match || !name) return null;
	const rest = text.slice(match[0].length);
	const delimiter = rest.charAt(0);
	const args = delimiter && /\s/u.test(delimiter) ? rest.slice(1) : rest;
	return { name, arguments: args };
}

/** Server-backed selectors, execution and interaction actions. */
export class SynchronizationActions {
	private skillsRequest?: Promise<void>;
	private commandsRequest?: Promise<void>;

	constructor(private readonly host: SynchronizationActionHost) {}

	/** Server-backed selectors; failures are displayed without blocking the conversation. */
	async loadOptions(): Promise<void> {
		if (!this.host.canCompose) {
			this.host.assertReady();
			return;
		}
		try {
			const client = await this.host.connection.connect();
			const signal = this.host.connection.signal;
			const [agents, models] = await Promise.all([
				client.agent.list({ location: { directory: this.host.sessions.vaultRoot } }, { signal }),
				client.model.list({ location: { directory: this.host.sessions.vaultRoot } }, { signal }),
			]);
			if (!this.host.canCompose) return;
			this.host.publishReady({
				agents: agents.data.filter((agent) => !agent.hidden && agent.mode !== 'subagent'),
				models: models.data.filter((model) => model.enabled),
				optionsError: undefined,
			});
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return;
			if (this.host.canCompose) this.host.publishReady({ optionsError: actionMessages.options });
		}
	}

	/**
	 * Lazy, non-fatal skill catalog for the composer. The first request is shared
	 * by concurrent callers; a failure publishes an empty catalog so chat keeps
	 * working and keystrokes do not retry it.
	 */
	loadSkills(): Promise<void> {
		if (this.host.state.skills !== undefined) return Promise.resolve();
		if (this.skillsRequest) return this.skillsRequest;
		const pending = this.fetchSkills().finally(() => {
			if (this.skillsRequest === pending) this.skillsRequest = undefined;
		});
		this.skillsRequest = pending;
		return pending;
	}

	/**
	 * Lazy, non-fatal command catalog for composer completion. It follows the
	 * skill catalog: one shared request, a connection-scoped result, and an empty
	 * catalog after failure so `/` text still reaches the prompt path.
	 */
	loadCommands(): Promise<void> {
		if (this.host.state.commands !== undefined) return Promise.resolve();
		if (this.commandsRequest) return this.commandsRequest;
		const pending = this.fetchCommands().finally(() => {
			if (this.commandsRequest === pending) this.commandsRequest = undefined;
		});
		this.commandsRequest = pending;
		return pending;
	}

	/** Returns whether delivery was confirmed, so the view clears only accepted text. */
	async sendMessage(text: string, attachments: readonly MessageAttachment[] = []): Promise<boolean> {
		try {
			this.host.assertReady();
		} catch {
			this.host.publishReady({ actionError: 'Wait until the conversation is synchronized and pending decisions are settled.' });
			return false;
		}
		const prompt = this.host.getPrompt();
		if (!prompt) return false;
		const command = leadingCommand(text);
		return command ? this.sendCommand(text, command, prompt, attachments) : this.sendPrompt(text, prompt, attachments);
	}

	private async sendPrompt(text: string, prompt: PromptCoordinator,
		attachments: readonly MessageAttachment[] = []): Promise<boolean> {
		try {
			const skillIDs = await this.resolveSkills(skillMentions(text).map((mention) => mention.name));
			const pending = await prompt.send(composePromptText(text, attachments), skillIDs,
				noteFiles(attachments, this.host.sessions.vaultRoot).files);
			this.host.publishReady({ pendingPrompt: prompt.pending, actionError: undefined, commandError: undefined });
			return pending.phase === 'admitted';
		} catch (error) {
			if (this.host.rejectIncompatible(error)) return false;
			this.host.publishReady({
				pendingPrompt: prompt.pending,
				commandError: undefined,
				actionError: error instanceof PromptError ? error.message : actionMessages.send,
			});
			if (prompt.pending?.phase === 'uncertain') this.host.recover();
			return false;
		}
	}

	/**
	 * A leading `/name` runs the command when it exactly matches a loaded name.
	 * Unknown names and an unavailable catalog keep the ordinary prompt path, so
	 * slash-leading prose is never dropped.
	 */
	private async sendCommand(text: string, command: LeadingCommand, prompt: PromptCoordinator,
		attachments: readonly MessageAttachment[] = []): Promise<boolean> {
		try {
			prompt.assertIdle();
			if (this.host.state.commands === undefined) await this.loadCommands();
			const known = (this.host.state.commands ?? []).some((entry) => entry.name === command.name);
			if (!known) return this.sendPrompt(text, prompt, attachments);
			const skillIDs = await this.resolveSkills(
				skillMentions(command.arguments).map((mention) => mention.name));
			const client = await this.host.connection.connect();
			await client.session.command({
				sessionID: prompt.sessionID,
				name: command.name,
				text: command.arguments,
				...(skillIDs.length > 0 ? { skills: skillIDs.map((id) => ({ id })) } : {}),
			}, { signal: this.host.connection.signal });
			const snapshot = await this.host.sessions.refreshSelected();
			this.host.publishReady({ snapshot, pendingPrompt: prompt.pending, actionError: undefined, commandError: undefined });
			return true;
		} catch (error) {
			if (error instanceof PromptError) {
				this.host.publishReady({ pendingPrompt: prompt.pending, commandError: undefined, actionError: error.message });
				return false;
			}
			if (this.host.rejectIncompatible(error)) return false;
			if (this.host.canOperate) {
				this.host.publishReady({
					pendingPrompt: prompt.pending,
					actionError: actionMessages.command,
					commandError: actionMessages.command,
				});
			}
			return false;
		}
	}

	private async fetchSkills(): Promise<void> {
		if (!this.host.canCompose) return;
		try {
			const client = await this.host.connection.connect();
			const result = await client.skill.list(
				{ location: { directory: this.host.sessions.vaultRoot } },
				{ signal: this.host.connection.signal });
			if (this.host.canCompose) this.host.publishReady({ skills: result.data });
		} catch {
			// Skills are optional; an incompatible or failed catalog must not gate chat.
			if (this.host.canCompose) this.host.publishReady({ skills: [] });
		}
	}

	private async fetchCommands(): Promise<void> {
		if (!this.host.canCompose) return;
		try {
			const client = await this.host.connection.connect();
			const result = await client.command.list(
				{ location: { directory: this.host.sessions.vaultRoot } },
				{ signal: this.host.connection.signal });
			if (this.host.canCompose) this.host.publishReady({ commands: result.data });
		} catch {
			// Commands are optional; a failure must leave `/name` usable as prompt text.
			if (this.host.canCompose) this.host.publishReady({ commands: [] });
		}
	}

	/** Exact-name resolution at send time; unknown mentions stay plain text. */
	private async resolveSkills(names: readonly string[]): Promise<string[]> {
		if (names.length === 0) return [];
		if (this.host.state.skills === undefined) await this.loadSkills();
		const idsByName = new Map<string, string>();
		for (const skill of this.host.state.skills ?? []) {
			if (!idsByName.has(skill.name)) idsByName.set(skill.name, skill.id);
		}
		const ids = new Set<string>();
		for (const name of names) {
			const id = idsByName.get(name);
			if (id !== undefined) ids.add(id);
		}
		return [...ids];
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
		if (!this.host.state.snapshot?.selected) {
			if (!this.host.canCompose) {
				this.host.assertReady();
				return;
			}
			try {
				const snapshot = await this.host.sessions.setDraftAgent(agent);
				this.host.publishReady({ snapshot, actionError: undefined });
			} catch (error) {
				this.host.rejectIncompatible(error);
				if (this.host.canCompose) this.host.publishReady({ actionError: actionMessages.agent });
			}
			return;
		}
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
		if (!this.host.state.snapshot?.selected) {
			if (!this.host.canCompose) {
				this.host.assertReady();
				return;
			}
			try {
				const snapshot = await this.host.sessions.setDraftModel(model);
				this.host.rememberModel(model);
				this.host.publishReady({ snapshot, actionError: undefined });
			} catch (error) {
				this.host.rejectIncompatible(error);
				if (this.host.canCompose) this.host.publishReady({ actionError: actionMessages.model });
			}
			return;
		}
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
			this.host.rememberModel(snapshot.selected?.model ?? model);
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
