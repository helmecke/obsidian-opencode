import type { SessionMessageAssistant, SessionMessageInfo } from '@opencode/client';
import type { PendingPrompt } from '../state/prompt-coordinator';
import { ToolEntryView } from './tool-entry';
import type { ToolEntry } from './tool-entry';

export interface MarkdownLike {
	set(text: string, final?: boolean): void;
	dispose(): void;
}

export interface ConversationOptions {
	createMarkdown(container: HTMLElement): MarkdownLike;
}

interface Part {
	readonly root: HTMLElement;
	readonly markdown?: MarkdownLike;
	readonly tool?: ToolEntry;
	readonly kind: string;
	signature: string;
}

interface Entry {
	readonly root: HTMLElement;
	readonly body: HTMLElement;
	readonly parts: Map<string, Part>;
	readonly markdowns: Set<MarkdownLike>;
	readonly tools: Set<ToolEntry>;
	kind: 'user' | 'assistant' | 'notice';
	signature: string;
}

function textOf(message: SessionMessageInfo): string {
	if ('text' in message && typeof message.text === 'string') return message.text;
	if ('description' in message && typeof message.description === 'string') return message.description;
	if (message.type === 'compaction') {
		const status = message.status;
		return status === 'running' ? 'Compacting the conversation…'
			: status === 'failed' ? `Compaction failed: ${message.error.message}` : 'Conversation compacted.';
	}
	if (message.type === 'shell') {
		const output = message.output?.output;
		return output ? `${message.command}\n\n${output}` : message.command;
	}
	if (message.type === 'idle') return `Execution ${message.outcome}.`;
	return message.type;
}

function partKey(part: SessionMessageAssistant['content'][number], index: number): string {
	return part.type === 'tool' ? `tool:${part.id}` : `${part.type}:${index}`;
}

/** Message-level diffing: streamed text updates in place; Markdown and tools keep stable lifetimes. */
export class ConversationRenderer {
	private readonly entries = new Map<string, Entry>();
	constructor(private readonly container: HTMLElement, private readonly options: ConversationOptions) {}

	render(messages: readonly SessionMessageInfo[], pending?: PendingPrompt): void {
		const desired: { id: string; message?: SessionMessageInfo; prompt?: PendingPrompt }[] = [];
		for (const message of messages) desired.push({ id: message.id, message });
		if (pending && !messages.some((message) => message.id === pending.id)) {
			desired.push({ id: `pending:${pending.id}`, prompt: pending });
		}
		const present = new Set(desired.map((item) => item.id));
		for (const [id, entry] of this.entries) {
			if (present.has(id)) continue;
			this.disposeEntry(entry);
			this.entries.delete(id);
		}
		for (const item of desired) {
			const entry = item.prompt ? this.promptEntry(item.id, item.prompt)
				: this.entries.get(item.id) ?? this.createEntry(item.id, item.message!);
			if (item.message) this.updateEntry(entry, item.message);
			this.container.appendChild(entry.root);
		}
	}

	dispose(): void {
		for (const entry of this.entries.values()) this.disposeEntry(entry);
		this.entries.clear();
	}

	private createEntry(id: string, message: SessionMessageInfo): Entry {
		const root = this.container.createDiv({ cls: `opencode-message opencode-message-${message.type}` });
		const body = root.createDiv({ cls: 'opencode-message-body' });
		const entry: Entry = { root, body, parts: new Map(), markdowns: new Set(), tools: new Set(),
			kind: message.type === 'user' ? 'user' : message.type === 'assistant' ? 'assistant' : 'notice', signature: '' };
		this.entries.set(id, entry);
		if (message.type === 'user' || message.type === 'assistant') {
			root.createDiv({ cls: 'opencode-message-role', text: message.type === 'user' ? 'You' : 'OpenCode' });
		}
		return entry;
	}

	private promptEntry(id: string, pending: PendingPrompt): Entry {
		const existing = this.entries.get(id);
		if (existing) {
			const status = existing.root.querySelector('.opencode-prompt-status');
			if (status) status.textContent = pending.phase === 'uncertain' ? 'Not confirmed' : 'Sending…';
			existing.root.toggleClass('is-uncertain', pending.phase === 'uncertain');
			return existing;
		}
		const root = this.container.createDiv({ cls: `opencode-message opencode-message-user opencode-prompt-${pending.phase}` });
		root.createDiv({ cls: 'opencode-message-role', text: 'You' });
		const body = root.createDiv({ cls: 'opencode-message-body' });
		body.createDiv({ cls: 'opencode-message-text', text: pending.text });
		root.createDiv({ cls: 'opencode-prompt-status', text: pending.phase === 'uncertain' ? 'Not confirmed' : 'Sending…' });
		const entry: Entry = { root, body, parts: new Map(), markdowns: new Set(), tools: new Set(), kind: 'user', signature: '' };
		this.entries.set(id, entry);
		return entry;
	}

	private updateEntry(entry: Entry, message: SessionMessageInfo): void {
		if (entry.kind === 'notice') {
			const text = textOf(message);
			if (entry.signature !== text) {
				entry.signature = text;
				entry.body.empty();
				entry.body.createDiv({ cls: 'opencode-message-notice', text });
			}
			return;
		}
		if (message.type === 'user') {
			if (entry.signature !== message.text) {
				entry.signature = message.text;
				entry.body.empty();
				entry.body.createDiv({ cls: 'opencode-message-text', text: message.text });
			}
			return;
		}
		if (message.type !== 'assistant') return;
		const assistant = message;
		const completed = assistant.time.completed !== undefined;
		const keys = new Set<string>();
		for (let index = 0; index < assistant.content.length; index++) {
			const content = assistant.content[index];
			if (!content) continue;
			const key = partKey(content, index);
			keys.add(key);
			let part = entry.parts.get(key);
			if (!part) {
				part = content.type === 'tool' ? this.createTool(entry, key)
					: this.createMarkdownPart(entry, key, content.type);
				entry.parts.set(key, part);
			}
			if (content.type === 'tool') part.tool?.update(content);
			else part.markdown?.set(content.text, completed);
			entry.body.appendChild(part.root);
		}
		for (const [key, part] of entry.parts) {
			if (keys.has(key)) continue;
			part.markdown?.dispose();
			part.tool?.dispose();
			part.root.remove();
			entry.parts.delete(key);
		}
	}

	private createMarkdownPart(entry: Entry, key: string, kind: string): Part {
		const root = entry.body.createDiv({ cls: `opencode-part opencode-part-${kind}` });
		let container = root;
		if (kind === 'reasoning') {
			const details = root.createEl('details', { cls: 'opencode-reasoning' });
			details.createEl('summary', { text: 'Reasoning' });
			container = details.createDiv();
		}
		const markdown = this.options.createMarkdown(container);
		entry.markdowns.add(markdown);
		return { root, markdown, kind, signature: '' };
	}

	private createTool(entry: Entry, key: string): Part {
		const root = entry.body.createDiv({ cls: 'opencode-part opencode-part-tool' });
		const tool = new ToolEntryView(root);
		entry.tools.add(tool);
		return { root, tool, kind: 'tool', signature: key };
	}

	private disposeEntry(entry: Entry): void {
		for (const markdown of entry.markdowns) markdown.dispose();
		for (const tool of entry.tools) tool.dispose();
		entry.markdowns.clear();
		entry.tools.clear();
		entry.root.remove();
	}
}
