import type { FileDiffInfo, ModelRef, SessionMessageAssistant, SessionMessageInfo } from '@opencode/client';
import { setIcon, setTooltip } from 'obsidian';
import type { PendingPrompt } from '../state/prompt-coordinator';
import { turnBounds } from '../opencode/diff-bounds';
import type { DiffBounds } from '../opencode/diff-bounds';
import { ChangedFilesDisclosure } from './changed-files';
import type { ChangedFilesActions } from './changed-files';
import { createDisclosureIcon } from './disclosure-icon';
import { durationBetween } from './duration';
import { ToolEntryView } from './tool-entry';
import type { ToolEntry } from './tool-entry';

export interface MarkdownLike {
	set(text: string, final?: boolean): void;
	dispose(): void;
}

export interface ConversationOptions {
	createMarkdown(container: HTMLElement): MarkdownLike;
	/** Display name for a model; the renderer falls back to the message's IDs. */
	modelLabel?(model: ModelRef): string;
	/** Display name for an agent; the renderer falls back to the message's agent ID. */
	agentLabel?(agent: string): string;
	/** Whether reasoning parts are shown; read on every render so a toggle applies live. */
	showReasoning?(): boolean;
	/** Attribute for the user's own records; a child transcript labels the delegated task. */
	promptLabel?: string;
	/** Open a subagent child session from its report embed. */
	openSubagent?(childID: string): void;
	/** Render a turn's changed-files disclosure; absent turns no such surface. */
	changedFiles?: ChangedFilesActions & {
		load(message: SessionMessageAssistant, bounds: DiffBounds): Promise<readonly FileDiffInfo[]>;
	};
}

interface FootnoteInfo {
	readonly model?: string;
	readonly agent?: string;
	readonly duration?: string;
}

interface Part {
	readonly root: HTMLElement;
	readonly markdown?: MarkdownLike;
	readonly tool?: ToolEntry;
	readonly kind: string;
	readonly preview?: HTMLElement;
	signature: string;
}

interface Entry {
	readonly root: HTMLElement;
	readonly body: HTMLElement;
	readonly parts: Map<string, Part>;
	readonly markdowns: Set<MarkdownLike>;
	readonly tools: Set<ToolEntry>;
	kind: 'user' | 'assistant' | 'notice' | 'disclosure' | 'embed';
	signature: string;
	footnote?: HTMLElement;
	footnoteSignature: string;
	changedFiles?: ChangedFilesDisclosure;
}

const suppressedTypes = new Set(['agent-switched', 'model-switched', 'location-switched']);

/** Routine records stay out of the document; the composer carries the execution state. */
function isSuppressed(message: SessionMessageInfo): boolean {
	if (message.type === 'idle') return message.outcome === 'succeeded';
	return suppressedTypes.has(message.type);
}

function oneLine(text: string, max: number): string {
	const collapsed = text.replace(/\s+/g, ' ').trim();
	return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}…` : collapsed;
}

interface SubagentResult {
	readonly caption: string;
	readonly body: string;
	/** Present only when the record names a child session that can be opened. */
	readonly childID?: string;
}

/** Metadata values are untrusted JSON; anything but a string is treated as absent. */
function metadataText(metadata: { readonly [key: string]: unknown } | undefined, key: string): string {
	const value = metadata?.[key];
	return typeof value === 'string' ? value.trim() : '';
}

/** Remove the service's one outer envelope, leaving the report Markdown untouched. */
function stripSubagentWrapper(text: string): string {
	return text
		.replace(/^\s*<subagent\b[^>]*>/i, '')
		.replace(/<\/subagent>\s*$/i, '')
		.trim();
}

/** A subagent result is recognized only from the record's metadata, never its text. */
function subagentResult(message: SessionMessageInfo): SubagentResult | undefined {
	if (message.type !== 'synthetic' || typeof message.text !== 'string') return undefined;
	const metadata = message.metadata;
	if (!metadata || metadata.source !== 'subagent') return undefined;
	const agent = metadataText(metadata, 'agent');
	// The service puts the task description on the record; some payloads also carry it in metadata.
	const recordDescription = typeof message.description === 'string' ? message.description.trim() : '';
	const description = metadataText(metadata, 'description') || recordDescription;
	const state = metadataText(metadata, 'state');
	const childID = metadataText(metadata, 'childID');
	const caption = [
		agent ? `${agent} subagent` : 'Subagent',
		description ? oneLine(description, maxPreviewCharacters) : '',
		state && state !== 'completed' ? 'cancelled' : '',
	].filter(Boolean).join(' · ');
	return { caption, body: stripSubagentWrapper(message.text), ...(childID ? { childID } : {}) };
}

const maxPreviewCharacters = 80;

/** Strip the most visible Markdown syntax so the collapsed row reads like a tool summary. */
function reasoningPreview(text: string): string {
	const plain = text
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*\d+[.)]\s+/gm, '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`~]/g, '');
	return oneLine(plain, maxPreviewCharacters);
}

function setPreview(preview: HTMLElement, text: string): void {
	preview.setText(text);
	preview.hidden = text.length === 0;
	if (text) preview.setAttribute('title', text);
	else preview.removeAttribute('title');
}

function compactionText(message: Extract<SessionMessageInfo, { type: 'compaction' }>): string {
	if (message.status === 'running') return 'Compacting the conversation…';
	if (message.status === 'failed') return `Compaction failed: ${message.error.message}`;
	return 'Conversation compacted.';
}

function outcomeText(message: Extract<SessionMessageInfo, { type: 'idle' }>): string {
	const heading = message.outcome === 'interrupted' ? 'Execution interrupted.' : 'Execution failed.';
	const detail = message.error?.message?.trim();
	return detail ? `${heading} ${detail}` : heading;
}

function disclosureOf(message: SessionMessageInfo): { label: string; body: string } {
	if (message.type === 'shell') {
		const output = message.output?.output;
		return { label: `Shell · ${oneLine(message.command, 60)}`,
			body: output ? `${message.command}\n\n${output}` : message.command };
	}
	if (message.type === 'skill') {
		return { label: `Skill · ${oneLine(message.name, 40)}`, body: message.text };
	}
	if (message.type === 'synthetic' || message.type === 'system') {
		const text = 'text' in message && typeof message.text === 'string' ? message.text : '';
		return { label: message.type === 'synthetic' ? 'Synthetic note' : 'System note', body: text };
	}
	const text = 'text' in message && typeof message.text === 'string' ? message.text : '';
	return { label: 'System note', body: text };
}

function entryLabel(message: SessionMessageInfo, promptLabel: string): string {
	if (message.type === 'user') return promptLabel;
	if (message.type === 'assistant') return 'OpenCode';
	if (message.type === 'idle') return 'Execution outcome';
	if (message.type === 'compaction') return 'Compaction';
	if (message.type === 'shell') return 'Shell';
	if (message.type === 'skill') return 'Skill';
	if (message.type === 'synthetic') return subagentResult(message)?.caption ?? 'Synthetic note';
	return 'System note';
}

function entryKind(message: SessionMessageInfo): Entry['kind'] {
	if (message.type === 'user') return 'user';
	if (message.type === 'assistant') return 'assistant';
	if (subagentResult(message)) return 'embed';
	if (message.type === 'idle' || message.type === 'compaction') return 'notice';
	return 'disclosure';
}

function partKey(part: SessionMessageAssistant['content'][number], index: number): string {
	return part.type === 'tool' ? `tool:${part.id}` : `${part.type}:${index}`;
}

/** Message-level diffing: streamed text updates in place; Markdown and tools keep stable lifetimes. */
export class ConversationRenderer {
	private readonly entries = new Map<string, Entry>();
	constructor(private readonly container: HTMLElement, private readonly options: ConversationOptions) {}

	private get promptLabel(): string { return this.options.promptLabel ?? 'You'; }

	render(messages: readonly SessionMessageInfo[], pending?: PendingPrompt): void {
		const visible = messages.filter((message) => !isSuppressed(message));
		const footnotes = this.footnotesFor(visible);
		const desired: { id: string; message?: SessionMessageInfo; prompt?: PendingPrompt; footnote?: FootnoteInfo }[] = [];
		for (const message of visible) desired.push({ id: message.id, message, footnote: footnotes.get(message.id) });
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
			if (item.message) this.updateEntry(entry, item.message, item.footnote, visible);
			this.container.appendChild(entry.root);
		}
	}

	dispose(): void {
		for (const entry of this.entries.values()) this.disposeEntry(entry);
		this.entries.clear();
	}

	private createEntry(id: string, message: SessionMessageInfo): Entry {
		const kind = entryKind(message);
		const rootClass = `opencode-message opencode-message-${message.type}${kind === 'embed' ? ' opencode-message-subagent' : ''}`;
		const root = this.container.createDiv({ cls: rootClass });
		root.setAttribute('role', 'group');
		root.setAttribute('aria-label', entryLabel(message, this.promptLabel));
		const body = root.createDiv({ cls: `opencode-message-body opencode-message-body-${kind}` });
		const entry: Entry = { root, body, parts: new Map(), markdowns: new Set(), tools: new Set(),
			kind, signature: '', footnoteSignature: '' };
		this.entries.set(id, entry);
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
		root.setAttribute('role', 'group');
		root.setAttribute('aria-label', this.promptLabel);
		const body = root.createDiv({ cls: 'opencode-message-body opencode-message-body-user' });
		this.renderPrompt(body, pending.text);
		root.createDiv({ cls: 'opencode-prompt-status', text: pending.phase === 'uncertain' ? 'Not confirmed' : 'Sending…' });
		root.toggleClass('is-uncertain', pending.phase === 'uncertain');
		const entry: Entry = { root, body, parts: new Map(), markdowns: new Set(), tools: new Set(),
			kind: 'user', signature: pending.text, footnoteSignature: '' };
		this.entries.set(id, entry);
		return entry;
	}

	private updateEntry(entry: Entry, message: SessionMessageInfo, footnote: FootnoteInfo | undefined,
		messages: readonly SessionMessageInfo[]): void {
		if (entry.kind === 'notice') {
			this.updateNotice(entry, message);
			return;
		}
		if (entry.kind === 'embed') {
			this.updateEmbed(entry, message);
			return;
		}
		if (entry.kind === 'disclosure') {
			this.updateDisclosure(entry, message);
			return;
		}
		if (message.type === 'user') {
			if (entry.signature !== message.text) {
				entry.signature = message.text;
				entry.body.empty();
				this.renderPrompt(entry.body, message.text);
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
			// Hidden reasoning stays out before its key or part exists, so no summary,
			// icon, preview, or body reaches the DOM. The key sweep removes one rendered earlier.
			if (content.type === 'reasoning' && !this.options.showReasoning?.()) continue;
			const key = partKey(content, index);
			keys.add(key);
			let part = entry.parts.get(key);
			if (!part) {
				part = content.type === 'tool' ? this.createTool(entry, key)
					: this.createMarkdownPart(entry, key, content.type);
				entry.parts.set(key, part);
			}
			if (content.type === 'tool') part.tool?.update(content);
			else {
				part.markdown?.set(content.text, completed);
				if (part.preview) setPreview(part.preview, reasoningPreview(content.text));
			}
			entry.body.appendChild(part.root);
		}
		for (const [key, part] of entry.parts) {
			if (keys.has(key)) continue;
			part.markdown?.dispose();
			part.tool?.dispose();
			part.root.remove();
			entry.parts.delete(key);
		}
		this.syncEdgeClasses(entry);
		this.syncChangedFiles(entry, assistant, messages);
		this.syncFootnote(entry, footnote);
	}

	private renderPrompt(container: HTMLElement, text: string): void {
		const frame = container.createDiv({ cls: 'opencode-prompt markdown-rendered' });
		const callout = frame.createDiv({ cls: 'callout' });
		callout.setAttribute('data-callout', 'prompt');
		const title = callout.createDiv({ cls: 'callout-title' });
		setIcon(title.createDiv({ cls: 'callout-icon' }), 'pencil');
		title.createDiv({ cls: 'callout-title-inner', text: this.promptLabel });
		callout.createDiv({ cls: 'callout-content' })
			.createEl('p', { cls: 'opencode-prompt-text', text });
	}

	private updateNotice(entry: Entry, message: SessionMessageInfo): void {
		const text = message.type === 'idle' ? outcomeText(message)
			: message.type === 'compaction' ? compactionText(message) : '';
		const signature = `${message.type}:${text}`;
		if (entry.signature === signature) return;
		entry.signature = signature;
		entry.body.empty();
		if (message.type === 'idle') {
			const outcome = entry.body.createDiv({ cls: `opencode-outcome is-${message.outcome}` });
			outcome.createSpan({ cls: 'opencode-outcome-text', text });
		} else {
			entry.body.createDiv({ cls: 'opencode-notice', text });
		}
	}

	private updateEmbed(entry: Entry, message: SessionMessageInfo): void {
		const result = subagentResult(message);
		if (!result) return;
		const signature = `${result.caption}\n${result.childID ?? ''}\n${result.body}`;
		if (entry.signature === signature) return;
		entry.signature = signature;
		entry.root.setAttribute('aria-label', result.caption);
		for (const markdown of entry.markdowns) markdown.dispose();
		entry.markdowns.clear();
		entry.body.empty();
		const embed = entry.body.createDiv({ cls: 'internal-embed markdown-embed inline-embed is-loaded' });
		if (result.childID) this.appendChildLink(embed, result.childID);
		embed.createDiv({ cls: 'embed-title markdown-embed-title', text: result.caption });
		const content = embed.createDiv({ cls: 'markdown-embed-content' });
		const preview = content.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
		const markdown = this.options.createMarkdown(preview);
		entry.markdowns.add(markdown);
		markdown.set(result.body, true);
	}

	/** Reuse the host's embed link affordance; only the activation is plugin-owned. */
	private appendChildLink(embed: HTMLElement, childID: string): void {
		const link = embed.createEl('a', {
			cls: 'markdown-embed-link',
			attr: { role: 'button', tabindex: '0', 'aria-label': 'Open subagent session' },
		});
		setIcon(link, 'maximize-2');
		setTooltip(link, 'Open subagent session');
		const open = () => this.options.openSubagent?.(childID);
		link.addEventListener('click', (event) => {
			event.preventDefault();
			open();
		});
		link.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			open();
		});
	}

	private updateDisclosure(entry: Entry, message: SessionMessageInfo): void {
		const content = disclosureOf(message);
		const signature = `${content.label}\n${content.body}`;
		if (entry.signature === signature) return;
		entry.signature = signature;
		entry.root.setAttribute('aria-label', content.label);
		entry.body.empty();
		const details = entry.body.createEl('details', { cls: 'opencode-disclosure' });
		details.createEl('summary', { text: content.label });
		const body = details.createDiv({ cls: 'opencode-disclosure-body' });
		body.createEl('pre', { cls: 'opencode-disclosure-text', text: content.body });
	}

	/** Mark the first and last part kind so a server-side message split keeps its group gap. */
	private syncEdgeClasses(entry: Entry): void {
		const parts = [...entry.parts.values()];
		const first = parts[0]?.kind;
		const last = parts[parts.length - 1]?.kind;
		const group = (kind: string | undefined) => kind === 'tool' || kind === 'reasoning';
		entry.root.toggleClass('opencode-first-part-text', first === 'text');
		entry.root.toggleClass('opencode-first-part-group', group(first));
		entry.root.toggleClass('opencode-last-part-text', last === 'text');
		entry.root.toggleClass('opencode-last-part-group', group(last));
	}

	/** A turn that reports files gains a trailing collapsed disclosure; one that reports none loses it. */
	private syncChangedFiles(entry: Entry, assistant: SessionMessageAssistant,
		messages: readonly SessionMessageInfo[]): void {
		const options = this.options.changedFiles;
		const files = (assistant.snapshot?.files ?? []).filter((file): file is string =>
			typeof file === 'string' && file.length > 0);
		if (!options || files.length === 0) {
			entry.changedFiles?.dispose();
			entry.changedFiles = undefined;
			return;
		}
		entry.changedFiles ??= new ChangedFilesDisclosure(entry.body, {
			load: () => options.load(assistant, turnBounds(assistant, messages)),
			open: (file) => options.open?.(file),
			copy: (patch) => options.copy?.(patch),
			notify: (message) => options.notify?.(message),
		});
		entry.changedFiles.update(files, () => options.load(assistant, turnBounds(assistant, messages)));
		entry.body.appendChild(entry.changedFiles.element);
	}

	private syncFootnote(entry: Entry, footnote?: FootnoteInfo): void {
		const text = [footnote?.model, footnote?.agent, footnote?.duration].filter(Boolean).join(' · ');
		if (!text) {
			entry.footnote?.remove();
			entry.footnote = undefined;
			entry.footnoteSignature = '';
			return;
		}
		if (entry.footnoteSignature === text && entry.footnote) return;
		entry.footnoteSignature = text;
		entry.footnote ??= entry.root.createDiv({ cls: 'opencode-message-footnote' });
		entry.footnote.setText(text);
	}

	/** One footnote per contiguous assistant run, on its final message. */
	private footnotesFor(messages: readonly SessionMessageInfo[]): Map<string, FootnoteInfo> {
		const footnotes = new Map<string, FootnoteInfo>();
		let index = 0;
		while (index < messages.length) {
			const first = messages[index];
			if (!first || first.type !== 'assistant') { index++; continue; }
			let last = first;
			let next = index + 1;
			while (next < messages.length && messages[next]?.type === 'assistant') {
				last = messages[next] as SessionMessageAssistant;
				next++;
			}
			const info = this.footnoteFor(first, last);
			if (info) footnotes.set(last.id, info);
			index = next;
		}
		return footnotes;
	}

	private footnoteFor(first: SessionMessageAssistant, last: SessionMessageAssistant): FootnoteInfo | undefined {
		if (last.time.completed === undefined) return undefined;
		const duration = durationBetween(first.time.created, last.time.completed);
		const model = last.model
			? this.options.modelLabel?.(last.model)?.trim() || `${last.model.providerID} · ${last.model.id}` : '';
		const agent = last.agent ? this.options.agentLabel?.(last.agent)?.trim() || last.agent : '';
		if (!model && !agent && !duration) return undefined;
		return { model: model || undefined, agent: agent || undefined, duration: duration || undefined };
	}

	private createMarkdownPart(entry: Entry, key: string, kind: string): Part {
		const root = entry.body.createDiv({ cls: `opencode-part opencode-part-${kind}` });
		let container = root;
		let preview: HTMLElement | undefined;
		if (kind === 'reasoning') {
			const details = root.createEl('details', { cls: 'opencode-reasoning' });
			const summary = details.createEl('summary', { cls: 'opencode-disclosure-summary' });
			createDisclosureIcon(summary, 'brain');
			summary.createSpan({ cls: 'opencode-reasoning-name', text: 'Reasoning' });
			preview = summary.createSpan({ cls: 'opencode-reasoning-preview' });
			container = details.createDiv({ cls: 'opencode-reasoning-body' });
		}
		const markdown = this.options.createMarkdown(container);
		entry.markdowns.add(markdown);
		return { root, markdown, kind, preview, signature: '' };
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
		entry.changedFiles?.dispose();
		entry.markdowns.clear();
		entry.tools.clear();
		entry.root.remove();
	}
}
