import type { SessionInfo, V2Event } from '@opencode/client';
import { sameDirectory } from '../opencode/vault-directory';
import type { SynchronizationState } from './synchronization-model';

export interface InteractionUpdate {
	readonly handled: boolean;
	readonly patch?: Partial<SynchronizationState>;
	/** Admission is authoritative-server work, not a connection failure. */
	readonly resync?: boolean;
}

/**
 * Reduce a live interaction/model event into a state patch. This is pure apart
 * from reading the current state; the coordinator publishes the patch.
 */
export function applyInteractionEvent(event: V2Event, selected: SessionInfo,
	state: SynchronizationState): InteractionUpdate {
	if (event.location && !sameDirectory(event.location.directory, selected.location.directory)) {
		return { handled: false };
	}
	switch (event.type) {
		case 'permission.asked': {
			if (event.data.sessionID !== selected.id) return { handled: false };
			if (state.permissions.some((request) => request.id === event.data.id)) return { handled: true };
			return { handled: true, patch: { permissions: [...state.permissions, {
				id: event.data.id, sessionID: event.data.sessionID, action: event.data.action,
				resources: event.data.resources, save: event.data.save, metadata: event.data.metadata,
				source: event.data.source, message: event.data.message,
			}] } };
		}
		case 'permission.replied': {
			if (event.data.sessionID !== selected.id) return { handled: false };
			const busy = state.interactionBusy?.kind === 'permission' && state.interactionBusy.id === event.data.requestID;
			return { handled: true, patch: {
				permissions: state.permissions.filter((request) => request.id !== event.data.requestID),
				interactionBusy: busy ? undefined : state.interactionBusy,
			} };
		}
		case 'form.created': {
			if (event.data.form.sessionID !== selected.id) return { handled: false };
			if (state.forms.some((form) => form.id === event.data.form.id)) return { handled: true };
			return { handled: true, patch: { forms: [...state.forms, event.data.form] } };
		}
		case 'form.replied':
		case 'form.cancelled': {
			if (event.data.sessionID !== selected.id) return { handled: false };
			const busy = state.interactionBusy?.kind === 'form' && state.interactionBusy.id === event.data.id;
			return { handled: true, patch: {
				forms: state.forms.filter((form) => form.id !== event.data.id),
				interactionBusy: busy ? undefined : state.interactionBusy,
			} };
		}
		case 'session.agent.selected': {
			if (event.data.sessionID !== selected.id || !state.snapshot) return { handled: false };
			return { handled: true, patch: { snapshot: { ...state.snapshot,
				selected: { ...selected, agent: event.data.agent } } } };
		}
		case 'session.model.selected': {
			if (event.data.sessionID !== selected.id || !state.snapshot) return { handled: false };
			return { handled: true, patch: { snapshot: { ...state.snapshot,
				selected: { ...selected, model: event.data.model } } } };
		}
		case 'session.renamed': {
			if (event.data.sessionID !== selected.id || !state.snapshot) return { handled: false };
			const title = event.data.title;
			return { handled: true, patch: { snapshot: { ...state.snapshot,
				sessions: state.snapshot.sessions.map((entry) => entry.id === selected.id
					? { ...entry, title } : entry),
				selected: { ...selected, title } } } };
		}
		case 'session.deleted': {
			if (event.data.sessionID !== selected.id) return { handled: false };
			const snapshot = state.snapshot ?? { sessions: [], messages: [] };
			return { handled: true, patch: {
				snapshot: { ...snapshot,
					sessions: snapshot.sessions.filter((entry) => entry.id !== selected.id),
					selected: undefined, messages: [], empty: 'unavailable' },
				conversation: undefined, permissions: [], forms: [], pendingPrompt: undefined } };
		}
		case 'session.inbox.delivered':
		case 'session.inbox.enqueued':
		case 'session.inbox.cancelled': {
			if (event.data.sessionID !== selected.id) return { handled: false };
			return { handled: true, resync: true };
		}
		case 'session.inbox.delivery.changed':
			return { handled: event.data.sessionID === selected.id };
		default: return { handled: false };
	}
}
