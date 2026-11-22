import type { SessionMessageInfo, SessionMessagesResponse } from '@opencode/client';
import {
	asArray, asFiniteNumber, asNonEmptyString, asRecord, asString, invalid, oneOf, optionalNullableString,
	optionalNumber, optionalRecord, validateModelRef, validateStructuredError,
} from './api-primitives';
import type { RecordValue } from './api-primitives';

/** Authoritative transcript shapes used by the conversation renderer and reducer. */

export function validateToolContent(value: unknown): void {
	const items = asArray(value);
	if (!items.length) return invalid();
	for (const item of items) {
		const content = asRecord(item);
		const type = asString(content.type);
		if (type === 'text') asString(content.text);
		else if (type === 'file') {
			asString(content.uri);
			asString(content.mime);
			if (content.name !== undefined && content.name !== null) asString(content.name);
		}
		// Unknown tool content is displayed as data and is safe to keep.
	}
}

function validateTool(value: RecordValue): void {
	asNonEmptyString(value.id);
	asString(value.name);
	const state = asRecord(value.state);
	const status = asString(state.status);
	switch (status) {
		case 'streaming':
			asString(state.input);
			return;
		case 'running':
			asRecord(state.input);
			asRecord(state.metadata);
			return;
		case 'completed':
			asRecord(state.input);
			validateToolContent(state.content);
			optionalRecord(state.metadata);
			return;
		case 'error':
			asRecord(state.input);
			validateStructuredError(state.error);
			if (state.content !== undefined) validateToolContent(state.content);
			optionalRecord(state.metadata);
			return;
		default: return invalid();
	}
}

function validateAssistantPart(value: unknown): void {
	const part = asRecord(value);
	const type = asString(part.type);
	if (type === 'text' || type === 'reasoning') {
		asString(part.text);
		if (part.time !== undefined) {
			const time = asRecord(part.time);
			asFiniteNumber(time.created);
			optionalNumber(time.completed);
		}
		return;
	}
	if (type === 'tool') {
		validateTool(part);
		return;
	}
	// The renderer has no safe presentation for a new assistant part type.
	return invalid();
}

function validateAssistantMessage(message: RecordValue): void {
	asNonEmptyString(message.agent);
	validateModelRef(message.model);
	const time = asRecord(message.time);
	asFiniteNumber(time.created);
	optionalNumber(time.streamed);
	optionalNumber(time.completed);
	for (const part of asArray(message.content)) validateAssistantPart(part);
	if (message.error !== undefined) validateStructuredError(message.error);
}

export function validateSessionMessage(value: unknown): SessionMessageInfo {
	const message = asRecord(value);
	asNonEmptyString(message.id);
	const type = asString(message.type);
	switch (type) {
		case 'assistant': validateAssistantMessage(message); break;
		case 'user': asString(message.text); break;
		case 'compaction': {
			const status = oneOf(message.status, ['running', 'completed', 'failed'] as const);
			if (status === 'failed') validateStructuredError(message.error);
			break;
		}
		case 'shell': {
			asString(message.command);
			if (message.output !== undefined) {
				const output = asRecord(message.output);
				asString(output.output);
			}
			break;
		}
		case 'idle':
			oneOf(message.outcome, ['succeeded', 'failed', 'interrupted'] as const);
			if (message.error !== undefined) validateStructuredError(message.error);
			break;
		// Other message kinds are rendered as notices using their type and are safe.
		default: break;
	}
	return value as SessionMessageInfo;
}

export function validateMessagePage(value: unknown): SessionMessagesResponse {
	const page = asRecord(value);
	const data = asArray(page.data).map(validateSessionMessage);
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
