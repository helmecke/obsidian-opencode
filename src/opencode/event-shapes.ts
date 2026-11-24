import type { V2Event } from '@opencode/client';
import {
	asFiniteNumber, asNonEmptyString, asRecord, asString, invalid, optionalBoolean, optionalNumber,
	optionalRecord, optionalString, validateLocation, validateModelRef, validateStructuredError,
} from './api-primitives';
import { validateFormInfo, validatePermissionRequest } from './interaction-shapes';
import { validateToolContent } from './message-shapes';

/**
 * Event envelope and used-field validation. Unknown event types are forwarded
 * unchanged so downstream recovery can decide how to handle them.
 */

const durableV1 = new Set([
	'session.created', 'session.agent.selected', 'session.model.selected', 'session.moved',
	'session.renamed', 'session.metadata.updated', 'session.permissions', 'session.viewed',
	'session.archived', 'session.unarchived', 'session.message.content.updated', 'session.usage.recorded',
	'session.inbox.delivered', 'session.inbox.enqueued', 'session.inbox.cancelled', 'session.inbox.delivery.changed',
	'session.execution.started', 'session.execution.succeeded', 'session.execution.failed', 'session.execution.interrupted',
	'session.synthetic', 'session.skill.activated', 'session.shell.started', 'session.shell.ended',
	'session.step.started', 'session.step.first-token', 'session.step.streamed', 'session.step.ended', 'session.step.failed',
	'session.text.started', 'session.text.ended', 'session.reasoning.started', 'session.reasoning.ended',
	'session.tool.input.started', 'session.tool.input.ended', 'session.tool.called', 'session.retry.scheduled',
	'session.compaction.started', 'session.compaction.ended', 'session.compaction.failed',
	'session.revert.staged', 'session.revert.cleared', 'session.revert.committed',
]);
const durableV2 = new Set([
	'session.deleted', 'session.forked', 'session.instructions.updated', 'session.tool.success', 'session.tool.failed',
]);
const ephemeral = new Set([
	'server.connected', 'session.status', 'session.idle', 'session.text.delta', 'session.reasoning.delta',
	'session.tool.input.delta', 'session.tool.progress', 'session.usage.updated',
	'permission.asked', 'permission.replied', 'form.created', 'form.replied', 'form.cancelled',
]);

function validateDurable(value: unknown, expected?: number): void {
	const durable = asRecord(value);
	asNonEmptyString(durable.aggregateID);
	const seq = durable.seq;
	if (!Number.isSafeInteger(seq) || (seq as number) < 0) return invalid();
	if (!Number.isSafeInteger(durable.version) || (durable.version as number) < 1) return invalid();
	if (expected !== undefined && durable.version !== expected) return invalid();
}

export function validateEventEnvelope(value: unknown): V2Event {
	const event = asRecord(value);
	const type = asNonEmptyString(event.type);
	asNonEmptyString(event.id);
	if (type !== 'server.connected') asFiniteNumber(event.created);
	if (event.location !== undefined) validateLocation(event.location);
	asRecord(event.data);
	return value as V2Event;
}

export function validateEvent(value: unknown): V2Event {
	validateEventEnvelope(value);
	const event = asRecord(value);
	const type = asNonEmptyString(event.type);
	// Durable schema versions belong to event definitions, not API releases.
	// Unknown types are only forwarded for authoritative recovery, never reduced
	// using an assumed version. Known types must match their reviewed contract.
	const expected = durableV1.has(type) ? 1 : durableV2.has(type) ? 2 : undefined;
	if (expected !== undefined) validateDurable(event.durable, expected);
	else if (event.durable !== undefined) {
		if (ephemeral.has(type)) return invalid();
		validateDurable(event.durable);
	}
	const data = asRecord(event.data);
	const session = (): void => { asNonEmptyString(data.sessionID); };
	const assistant = (): void => { session(); asNonEmptyString(data.assistantMessageID); };
	const ordinal = (): void => {
		if (!Number.isSafeInteger(data.ordinal) || (data.ordinal as number) < 0) return invalid();
	};
	switch (type) {
		case 'session.step.first-token': assistant(); break;
		case 'session.status':
			session();
			asString(asRecord(data.status).type);
			break;
		case 'session.idle':
			session();
			if (data.error !== undefined) validateStructuredError(data.error);
			break;
		case 'session.execution.started':
		case 'session.execution.succeeded':
		case 'session.execution.interrupted': session(); break;
		case 'session.execution.failed':
			session();
			validateStructuredError(data.error);
			break;
		case 'session.step.started':
			assistant();
			asString(data.agent);
			validateModelRef(data.model);
			asFiniteNumber(data.started);
			break;
		case 'session.step.streamed': assistant(); break;
		case 'session.step.ended':
			assistant();
			asString(data.finish);
			optionalString(data.rawFinish);
			asFiniteNumber(data.cost);
			asRecord(data.tokens);
			optionalRecord(data.native);
			break;
		case 'session.step.failed':
			assistant();
			validateStructuredError(data.error);
			optionalString(data.finish);
			optionalString(data.rawFinish);
			optionalNumber(data.cost);
			optionalRecord(data.tokens);
			optionalRecord(data.native);
			break;
		case 'session.text.started':
		case 'session.reasoning.started': assistant(); ordinal(); break;
		case 'session.text.delta':
		case 'session.reasoning.delta':
			assistant();
			ordinal();
			asString(data.delta);
			break;
		case 'session.text.ended':
		case 'session.reasoning.ended':
			assistant();
			ordinal();
			asString(data.text);
			optionalRecord(data.native);
			break;
		case 'session.tool.input.started':
			assistant();
			asString(data.id);
			asString(data.name);
			break;
		case 'session.tool.input.delta':
			assistant();
			asString(data.id);
			asString(data.delta);
			break;
		case 'session.tool.input.ended':
			assistant();
			asString(data.id);
			asString(data.text);
			break;
		case 'session.tool.called':
			assistant();
			asString(data.id);
			asRecord(data.input);
			optionalBoolean(data.executed);
			optionalRecord(data.native);
			break;
		case 'session.tool.progress':
			assistant();
			asString(data.id);
			asRecord(data.metadata);
			break;
		case 'session.tool.success':
			assistant();
			asNonEmptyString(data.id);
			validateToolContent(data.content);
			if (typeof data.executed !== 'boolean') return invalid();
			optionalRecord(data.metadata);
			break;
		case 'session.tool.failed':
			assistant();
			asNonEmptyString(data.id);
			validateStructuredError(data.error);
			if (data.content !== undefined) validateToolContent(data.content);
			if (typeof data.executed !== 'boolean') return invalid();
			optionalRecord(data.metadata);
			break;
		case 'permission.asked': validatePermissionRequest(data); break;
		case 'permission.replied':
			session();
			asNonEmptyString(data.requestID);
			break;
		case 'form.created': validateFormInfo(data.form); break;
		case 'form.replied':
		case 'form.cancelled':
			asNonEmptyString(data.id);
			asNonEmptyString(data.sessionID);
			break;
		case 'session.agent.selected':
			session();
			asString(data.agent);
			break;
		case 'session.model.selected':
			session();
			validateModelRef(data.model);
			break;
		case 'session.moved': session(); break;
		case 'session.renamed':
			session();
			asString(data.title);
			break;
		case 'session.deleted': session(); break;
		case 'session.inbox.delivered':
		case 'session.inbox.enqueued':
		case 'session.inbox.cancelled':
		case 'session.inbox.delivery.changed': session(); break;
		// Unhandled and future event types are forwarded so recovery can decide.
		default: break;
	}
	return value as V2Event;
}
