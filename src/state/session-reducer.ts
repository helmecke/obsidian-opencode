import type { SessionMessageAssistant, SessionMessageAssistantTool, SessionMessageInfo,
	SessionStatus, SessionStructuredError, V2Event } from '@opencode/client';

export type ExecutionState = 'unknown' | 'running' | 'succeeded' | 'failed' | 'interrupted';
export interface ConversationProjection {
	readonly messages: readonly SessionMessageInfo[];
	readonly execution: ExecutionState;
	readonly status?: SessionStatus;
	readonly error?: SessionStructuredError;
}

/** A live projection only. Snapshot/event reconciliation belongs to the recovery coordinator. */
export class SessionReducer {
	private messages: SessionMessageInfo[];
	private execution: ExecutionState;
	private error?: SessionStructuredError;
	private status?: SessionStatus;
	private readonly parts = new Map<string, { index: number; ended: boolean }>();
	constructor(messages: readonly SessionMessageInfo[], execution: ExecutionState = 'unknown') {
		this.messages = structuredClone([...messages]);
		this.execution = execution;
	}

	get state(): ConversationProjection {
		return { messages: this.messages, execution: this.execution, status: this.status, error: this.error };
	}

	/** False means uncertainty: caller must discard this projection, not publish a partial guess. */
	apply(event: V2Event): boolean {
		// Added in 2.3.2; the pinned 2.2.2 client forwards unknown native events.
		// This timing-only milestone carries no text or execution outcome. Admit it
		// in durable sequence order without forcing a snapshot during every answer.
		if ((event.type as string) === 'session.step.first-token') {
			const data = event.data as { assistantMessageID?: unknown };
			const message = typeof data.assistantMessageID === 'string' ? this.assistant(data.assistantMessageID) : undefined;
			return message !== undefined && message.time.completed === undefined;
		}
		switch (event.type) {
			// Idle/busy notifications do not identify an execution outcome. Keep them separate.
			case 'session.status': this.status = event.data.status; return true;
			case 'session.idle': this.status = { type: 'idle' }; return true;
			// Session-scoped notifications that never mutate the message projection.
			// The service publishes usage counters after every step and a scheduling
			// note before a retry; the retry itself then streams ordinary step/text
			// events. Admitting these without a reload keeps a live answer from
			// flickering through the recovery path on every notification.
			case 'session.usage.updated':
			case 'session.retry.scheduled':
				return true;
			case 'session.execution.started': this.execution = 'running'; this.error = undefined; return true;
			case 'session.execution.succeeded': this.execution = 'succeeded'; this.error = undefined; return true;
			case 'session.execution.interrupted': this.execution = 'interrupted'; this.error = undefined; return true;
			case 'session.execution.failed': this.execution = 'failed'; this.error = event.data.error; return true;
			case 'session.step.started': {
				// An existing snapshot message may already contain these deltas. Never reset/append speculatively.
				if (this.messages.some((m) => m.id === event.data.assistantMessageID)) return false;
				this.messages = [...this.messages, {
					id: event.data.assistantMessageID, type: 'assistant', agent: event.data.agent,
					model: event.data.model, time: { created: event.data.started }, content: [],
				}];
				return true;
			}
			case 'session.text.started':
			case 'session.text.delta':
			case 'session.text.ended':
			case 'session.reasoning.started':
			case 'session.reasoning.delta':
			case 'session.reasoning.ended': {
				const message = this.assistant(event.data.assistantMessageID);
				if (!message || message.time.completed !== undefined) return false;
				const kind = event.type.startsWith('session.text.') ? 'text' : 'reasoning';
				const key = JSON.stringify([message.id, kind, event.data.ordinal]);
				if (!Number.isSafeInteger(event.data.ordinal) || event.data.ordinal < 0) return false;
				if (event.type.endsWith('.started')) {
					if (this.parts.has(key)) return false;
					this.parts.set(key, { index: message.content.length, ended: false });
					message.content.push({ type: kind, text: '' });
					return true;
				}
				const part = this.parts.get(key);
				if (!part || part.ended) return false;
				const content = message.content[part.index];
				if (!content || content.type !== kind) return false;
				if ('delta' in event.data) content.text += event.data.delta;
				else if ('text' in event.data) { content.text = event.data.text; part.ended = true; }
				return true;
			}
			case 'session.tool.input.started': {
				const message = this.assistant(event.data.assistantMessageID);
				if (!message || message.time.completed !== undefined) return false;
				if (this.tool(message, event.data.id)) return false;
				message.content.push({
					type: 'tool', id: event.data.id, name: event.data.name,
					state: { status: 'streaming', input: '' }, time: { created: event.created },
				});
				return true;
			}
			case 'session.tool.input.delta': {
				const tool = this.toolFor(event.data.assistantMessageID, event.data.id);
				if (!tool || tool.state.status !== 'streaming') return false;
				tool.state.input += event.data.delta;
				return true;
			}
			case 'session.tool.input.ended': {
				const tool = this.toolFor(event.data.assistantMessageID, event.data.id);
				if (!tool || tool.state.status !== 'streaming') return false;
				tool.state.input = event.data.text;
				return true;
			}
			case 'session.tool.called': {
				let tool = this.toolFor(event.data.assistantMessageID, event.data.id);
				const message = this.assistant(event.data.assistantMessageID);
				if (!message || message.time.completed !== undefined) return false;
				if (!tool) {
					tool = {
						type: 'tool', id: event.data.id, name: event.data.id,
						state: { status: 'running', input: event.data.input, metadata: {} },
						time: { created: event.created },
					};
					message.content.push(tool);
				} else if (tool.state.status === 'streaming') {
					tool.state = { status: 'running', input: event.data.input, metadata: {} };
				} else return false;
				tool.executed = event.data.executed;
				if (event.data.native) tool.native = event.data.native;
				tool.time.ran = event.created;
				return true;
			}
			case 'session.tool.progress': {
				const tool = this.toolFor(event.data.assistantMessageID, event.data.id);
				if (!tool || tool.state.status !== 'running') return false;
				tool.state.metadata = { ...tool.state.metadata, ...event.data.metadata };
				return true;
			}
			case 'session.tool.success': {
				const tool = this.toolFor(event.data.assistantMessageID, event.data.id);
				if (!tool) return false;
				tool.state = {
					status: 'completed', input: this.toolInput(tool), content: event.data.content,
					metadata: event.data.metadata,
				};
				tool.executed = event.data.executed;
				tool.time.completed = event.created;
				return true;
			}
			case 'session.tool.failed': {
				const tool = this.toolFor(event.data.assistantMessageID, event.data.id);
				if (!tool) return false;
				tool.state = {
					status: 'error', input: this.toolInput(tool), error: event.data.error,
					content: event.data.content, metadata: event.data.metadata,
				};
				tool.executed = event.data.executed;
				tool.time.completed = event.created;
				return true;
			}
			case 'session.step.streamed':
			case 'session.step.ended':
			case 'session.step.failed': {
				const message = this.assistant(event.data.assistantMessageID);
				if (!message || message.time.completed !== undefined) return false;
				if (event.type === 'session.step.streamed') message.time.streamed = event.created;
				else {
					message.time.completed = event.created;
					message.finish = event.type === 'session.step.failed' ? event.data.finish ?? 'error' : event.data.finish;
					message.cost = event.data.cost;
					message.tokens = event.data.tokens;
					message.native = event.data.native;
					message.rawFinish = event.data.rawFinish;
					if (event.type === 'session.step.failed') message.error = event.data.error;
				}
				return true;
			}
			// Other session mutations must be refreshed until their focused reducers are implemented.
			default: return false;
		}
	}

	private assistant(id: string): SessionMessageAssistant | undefined {
		const message = this.messages.find((m) => m.id === id);
		return message?.type === 'assistant' ? message : undefined;
	}

	private tool(message: SessionMessageAssistant, id: string): SessionMessageAssistantTool | undefined {
		const part = message.content.find((content) => content.type === 'tool' && content.id === id);
		return part?.type === 'tool' ? part : undefined;
	}

	private toolFor(messageID: string, id: string): SessionMessageAssistantTool | undefined {
		const message = this.assistant(messageID);
		return message ? this.tool(message, id) : undefined;
	}

	private toolInput(tool: SessionMessageAssistantTool): Extract<SessionMessageAssistantTool['state'], { status: 'running' }>['input'] {
		if (tool.state.status === 'streaming') {
			try {
				const parsed: unknown = JSON.parse(tool.state.input);
				return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
					? parsed as Extract<SessionMessageAssistantTool['state'], { status: 'running' }>['input'] : {};
			} catch { return {}; }
		}
		return tool.state.input;
	}
}
