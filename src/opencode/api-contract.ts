import { isSessionNotFoundError } from '@opencode/client';
import type { OpenCode, V2Event } from '@opencode/client';
import { OpenCodeApiCompatibilityError } from './compatibility';
import {
	validateActiveSessions, validateAgentList, validateEventEnvelope, validateFormList, validateMessagePage,
	validateModelList, validatePermissionList, validateSessionInfo, validateSessionPage,
} from './api-shapes';

export {
	validateActiveSessions,
	validateAgentList,
	validateEvent,
	validateFormInfo,
	validateFormList,
	validateMessagePage,
	validateModelList,
	validatePermissionList,
	validatePermissionRequest,
	validateSessionInfo,
	validateSessionMessage,
	validateSessionPage,
} from './api-shapes';
export { OpenCodeApiCompatibilityError } from './compatibility';

type Client = ReturnType<typeof OpenCode.make>;
type Subscribe = Client['event']['subscribe'];

/** Required endpoints that answer 404/405/415/etc. are incompatible, not empty. */
const incompatibleStatuses = new Set([400, 404, 405, 406, 415, 422, 501]);

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown> : undefined;
}

function statusOf(error: unknown): number | undefined {
	const value = record(error);
	if (!value) return undefined;
	if (typeof value.status === 'number') return value.status;
	const cause = record(value.cause);
	return cause && typeof cause.status === 'number' ? cause.status : undefined;
}

/**
 * Preserve transport, authentication, cancellation, and missing-session errors.
 * Translate only contract failures to the fixed API compatibility error.
 */
export function translateApiError(error: unknown, mutation = false): unknown {
	if (error instanceof OpenCodeApiCompatibilityError || isSessionNotFoundError(error)) return error;
	const status = statusOf(error);
	if (status === 401 || status === 403) return error;
	// A decision may legitimately fail server-side answer validation. Refresh
	// pending state and show that failure; do not mislabel it an API mismatch.
	if (mutation && (status === 400 || status === 422)) return error;
	if (status !== undefined && incompatibleStatuses.has(status)) return new OpenCodeApiCompatibilityError();
	const reason = record(error)?.reason;
	if (reason === 'MalformedResponse' || reason === 'UnsupportedContentType') {
		return new OpenCodeApiCompatibilityError();
	}
	return error;
}

async function request<T>(run: () => Promise<T>, mutation = false): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw translateApiError(error, mutation);
	}
}

async function guarded<T>(run: () => Promise<T>, validate: (value: unknown) => T): Promise<T> {
	const value: unknown = await request(run);
	try {
		return validate(value);
	} catch {
		throw new OpenCodeApiCompatibilityError();
	}
}

async function* validatedEvents(source: AsyncIterable<unknown>): AsyncIterable<V2Event> {
	try {
		for await (const event of source) yield validateEventEnvelope(event);
	} catch (error) {
		throw translateApiError(error);
	}
}

/**
 * Wrap the generated client at the transport boundary. Health is checked by
 * discovery before this wrapper is created. Unknown event types remain available
 * to downstream recovery; only used fields are validated.
 */
export function withApiValidation(client: Client): Client {
	const subscribe = ((options?: Parameters<Subscribe>[0]) =>
		validatedEvents(client.event.subscribe(options))) as Subscribe;
	const wrapped: Client = {
		...client,
		agent: {
			...client.agent,
			list: (input, options) => guarded(() => client.agent.list(input, options), validateAgentList),
		},
		model: {
			...client.model,
			list: (input, options) => guarded(() => client.model.list(input, options), validateModelList),
		},
		message: {
			...client.message,
			list: (input, options) => guarded(() => client.message.list(input, options), validateMessagePage),
		},
		permission: {
			...client.permission,
			reply: (input, options) => request(() => client.permission.reply(input, options), true),
			list: (input, options) => guarded(() => client.permission.list(input, options),
				(value) => validatePermissionList(value, input.sessionID)),
		},
		session: {
			...client.session,
			switchAgent: (input, options) => request(() => client.session.switchAgent(input, options), true),
			switchModel: (input, options) => request(() => client.session.switchModel(input, options), true),
			interrupt: (input, options) => guarded(() => client.session.interrupt(input, options), (value) => {
				if (typeof record(value)?.interrupted !== 'boolean') throw new OpenCodeApiCompatibilityError();
				return value as Awaited<ReturnType<Client['session']['interrupt']>>;
			}),
			// Admission identity/text are checked by PromptCoordinator. Preserve API
			// incompatibility rather than collapsing it into an ordinary send failure.
			prompt: (input, options) => request(() => client.session.prompt(input, options), true),
			list: (input, options) => guarded(() => client.session.list(input, options), validateSessionPage),
			active: (options) => guarded(() => client.session.active(options), validateActiveSessions),
			get: (input, options) => guarded(() => client.session.get(input, options), (value) => {
				const session = validateSessionInfo(value);
				if (session.id !== input.sessionID) throw new OpenCodeApiCompatibilityError();
				return session;
			}),
			create: (input, options) => guarded(() => client.session.create(input, options), (value) => {
				const session = validateSessionInfo(value);
				if (input?.id != null && session.id !== input.id) throw new OpenCodeApiCompatibilityError();
				return session;
			}),
			form: {
				...client.session.form,
				reply: (input, options) => request(() => client.session.form.reply(input, options), true),
				cancel: (input, options) => request(() => client.session.form.cancel(input, options), true),
				list: (input, options) => guarded(() => client.session.form.list(input, options),
					(value) => validateFormList(value, input.sessionID)),
			},
		},
		event: { ...client.event, subscribe },
	};
	return wrapped;
}
