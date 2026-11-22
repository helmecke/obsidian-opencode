import type { SessionActive, SessionInfo, SessionsResponse } from '@opencode/client';
import {
	asArray, asNonEmptyString, asRecord, asString, invalid, oneOf, optionalNullableString,
	optionalString, validateLocation, validateModelRef,
} from './api-primitives';

/** Session list, get, create, and active-execution shapes used by production. */

export function validateSessionInfo(value: unknown): SessionInfo {
	const session = asRecord(value);
	asNonEmptyString(session.id);
	validateLocation(session.location);
	optionalString(session.title);
	optionalString(session.agent);
	if (session.model !== undefined) validateModelRef(session.model);
	if (session.outcome !== undefined) oneOf(session.outcome, ['succeeded', 'failed', 'interrupted'] as const);
	return value as SessionInfo;
}

export function validateSessionPage(value: unknown): SessionsResponse {
	const page = asRecord(value);
	const data = asArray(page.data).map(validateSessionInfo);
	const cursor = asRecord(page.cursor);
	optionalNullableString(cursor.next);
	optionalNullableString(cursor.previous);
	return {
		data,
		cursor: {
			next: (cursor.next ?? null) as string | null,
			previous: (cursor.previous ?? null) as string | null,
		},
	};
}

export function validateActiveSessions(value: unknown): Record<string, SessionActive> {
	const active = asRecord(value);
	for (const id of Object.keys(active)) {
		if (!id) return invalid();
		// Only the session key is used by production. Validate the value enough to
		// reject malformed maps while admitting future active-state names.
		asString(asRecord(active[id]).type);
	}
	return value as Record<string, SessionActive>;
}
