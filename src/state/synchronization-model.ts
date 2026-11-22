import type { AgentInfo, FormInfo, ModelInfo, PermissionRequest } from '@opencode/client';
import * as timers from 'node:timers';
import type { SessionSnapshot } from '../opencode/sessions';
import type { ConversationProjection } from './session-reducer';
import type { PendingPrompt } from './prompt-coordinator';

export interface InteractionBusy {
	readonly kind: 'permission' | 'form';
	readonly id: string;
}

export interface SynchronizationState {
	readonly phase: 'inactive' | 'synchronizing' | 'ready' | 'retrying' | 'exhausted' | 'disposed';
	readonly attempt: number;
	readonly delay?: number;
	readonly error?: string;
	readonly snapshot?: SessionSnapshot;
	readonly conversation?: ConversationProjection;
	readonly permissions: readonly PermissionRequest[];
	readonly forms: readonly FormInfo[];
	readonly pendingPrompt?: PendingPrompt;
	readonly agents?: readonly AgentInfo[];
	readonly models?: readonly ModelInfo[];
	readonly optionsError?: string;
	readonly actionError?: string;
	readonly interactionBusy?: InteractionBusy;
}

export interface Policy {
	retries: number; baseDelay: number; maxDelay: number; timeout: number;
	maxEvents: number; maxCharacters: number; snapshotPasses: number;
}

export const defaultPolicy: Policy = {
	retries: 4, baseDelay: 500, maxDelay: 4000, timeout: 15000,
	maxEvents: 512, maxCharacters: 1024 * 1024, snapshotPasses: 3,
};

export const actionMessages = {
	send: 'Unable to confirm whether the message was received. Its text was kept; reconcile before retrying.',
	retry: 'The message is still unconfirmed. Reconcile again before retrying.',
	stop: 'Unable to confirm execution interruption. The conversation was refreshed; check its current state.',
	agent: 'Unable to change the agent. The server-confirmed selection is unchanged.',
	model: 'Unable to change the model. The server-confirmed selection is unchanged.',
	permission: 'Unable to submit the permission decision. Current server state was refreshed; retry only if the request is still shown.',
	form: 'Unable to submit the form answer. Current server state was refreshed; retry only if the form is still shown.',
	formCancel: 'Unable to cancel the form. Current server state was refreshed.',
	options: 'Unable to load available agents and models. Retry when connected.',
	interactions: 'Unable to refresh pending interactions. Reconnect and retry.',
} as const;

export interface RecoveryClock {
	set(callback: () => void, delay: number): unknown;
	clear(handle: unknown): void;
}

export const clock: RecoveryClock = {
	set: (callback, delay) => timers.setTimeout(callback, delay),
	clear: (handle) => timers.clearTimeout(handle as ReturnType<typeof timers.setTimeout>),
};

export function backoffDelay(policy: Policy, failures: number): number {
	return Math.min(policy.maxDelay, policy.baseDelay * 2 ** (failures - 1));
}
