import type { SessionMessageAssistantTool } from '@opencode/client';
import { createDisclosureIcon } from './disclosure-icon';
import { durationBetween } from './duration';

const maxDetailCharacters = 20_000;
const maxPreviewCharacters = 80;
const previewKeys = ['command', 'filePath', 'path', 'pattern', 'query', 'url', 'description'];

export interface ToolEntry {
	update(tool: SessionMessageAssistantTool): void;
	dispose(): void;
}

export function toolStatus(tool: SessionMessageAssistantTool): { readonly label: string; readonly className: string } {
	if (tool.state.status === 'streaming') return { label: 'Preparing', className: 'is-streaming' };
	if (tool.state.status === 'running') return { label: 'Running', className: 'is-running' };
	if (tool.state.status === 'completed') return { label: 'Done', className: 'is-completed' };
	return { label: 'Failed', className: 'is-failed' };
}

/** Completed tools show their duration instead of the word Done. */
export function toolSummaryStatus(tool: SessionMessageAssistantTool): { readonly label: string; readonly className: string } {
	if (tool.state.status !== 'completed') return toolStatus(tool);
	const duration = durationBetween(tool.time.ran ?? tool.time.created, tool.time.completed);
	return { label: duration || 'Done', className: 'is-completed' };
}

function firstPreviewString(input: unknown): string {
	if (typeof input === 'string') return input;
	if (!input || typeof input !== 'object') return '';
	const record = input as Record<string, unknown>;
	for (const key of previewKeys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value;
	}
	for (const value of Object.values(record)) {
		if (typeof value === 'string' && value.trim()) return value;
	}
	return '';
}

/** One-line, length-bounded summary of the most useful tool input value. */
export function toolPreview(tool: SessionMessageAssistantTool): string {
	const collapsed = firstPreviewString(tool.state.input).replace(/\s+/g, ' ').trim();
	if (collapsed.length <= maxPreviewCharacters) return collapsed;
	return `${collapsed.slice(0, maxPreviewCharacters - 1).trimEnd()}…`;
}

function detailText(value: unknown): string {
	try {
		const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		return text.length > maxDetailCharacters ? `${text.slice(0, maxDetailCharacters)}\n… (details truncated)` : text;
	} catch { return 'Details could not be displayed.'; }
}

/** Compact, collapsed-by-default tool entry. Output is rendered as text, never as HTML or Markdown. */
export class ToolEntryView implements ToolEntry {
	readonly el: HTMLDetailsElement;
	private readonly summaryName: HTMLElement;
	private readonly summaryStatus: HTMLElement;
	private readonly summaryPreview: HTMLElement;
	private readonly body: HTMLElement;
	private signature = '';
	constructor(container: HTMLElement) {
		this.el = container.createEl('details', { cls: 'opencode-tool' });
		const summary = this.el.createEl('summary', { cls: 'opencode-disclosure-summary' });
		createDisclosureIcon(summary, 'wrench', 'opencode-tool-icon opencode-disclosure-icon');
		this.summaryName = summary.createSpan({ cls: 'opencode-tool-name' });
		this.summaryStatus = summary.createSpan({ cls: 'opencode-tool-status' });
		this.summaryPreview = summary.createSpan({ cls: 'opencode-tool-preview' });
		this.body = this.el.createDiv({ cls: 'opencode-tool-body' });
	}

	update(tool: SessionMessageAssistantTool): void {
		const status = toolSummaryStatus(tool);
		this.summaryName.setText(tool.name || tool.id);
		this.summaryStatus.setText(status.label);
		this.summaryStatus.className = `opencode-tool-status ${status.className}`;
		const preview = toolPreview(tool);
		this.summaryPreview.setText(preview);
		this.summaryPreview.hidden = preview.length === 0;
		if (preview) this.summaryPreview.setAttribute('title', preview);
		else this.summaryPreview.removeAttribute('title');
		const signature = detailText({ state: tool.state, executed: tool.executed });
		if (signature === this.signature) return;
		this.signature = signature;
		this.body.empty();
		this.body.createEl('p', { text: 'Input', cls: 'opencode-muted' });
		this.body.createEl('pre', { text: detailText(tool.state.input) });
		if (tool.state.status === 'completed' && tool.state.content.length) {
			this.body.createEl('p', { text: 'Result', cls: 'opencode-muted' });
			for (const content of tool.state.content) {
				this.body.createEl('pre', { text: content.type === 'text' ? detailText(content.text)
					: detailText({ type: content.type, uri: content.uri, name: content.name, mime: content.mime }) });
			}
		}
		if (tool.state.status === 'error') {
			this.body.createEl('p', { text: 'Error', cls: 'opencode-muted' });
			this.body.createEl('pre', { text: detailText(tool.state.error) });
			for (const content of tool.state.content ?? []) {
				this.body.createEl('pre', { text: content.type === 'text' ? detailText(content.text) : detailText(content) });
			}
		}
		if (tool.state.status === 'running' && Object.keys(tool.state.metadata).length) {
			this.body.createEl('p', { text: 'Progress', cls: 'opencode-muted' });
			this.body.createEl('pre', { text: detailText(tool.state.metadata) });
		}
	}

	dispose(): void { this.el.remove(); }
}
