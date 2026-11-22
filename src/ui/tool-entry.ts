import type { SessionMessageAssistantTool } from '@opencode/client';

const maxDetailCharacters = 20_000;

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

function detailText(value: unknown): string {
	try {
		const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
		return text.length > maxDetailCharacters ? `${text.slice(0, maxDetailCharacters)}\n… (details truncated)` : text;
	} catch { return 'Details could not be displayed.'; }
}

/** Compact, collapsed-by-default tool entry. Output is rendered as text, never as HTML or Markdown. */
export class ToolEntryView implements ToolEntry {
	readonly el: HTMLDetailsElement;
	private readonly summaryStatus: HTMLElement;
	private readonly body: HTMLElement;
	private signature = '';
	constructor(container: HTMLElement) {
		this.el = container.createEl('details', { cls: 'opencode-tool' });
		const summary = this.el.createEl('summary');
		this.summaryStatus = summary.createSpan({ cls: 'opencode-tool-status' });
		summary.createSpan({ cls: 'opencode-tool-name' });
		this.body = this.el.createDiv({ cls: 'opencode-tool-body' });
	}

	update(tool: SessionMessageAssistantTool): void {
		const status = toolStatus(tool);
		const name = this.el.querySelector('.opencode-tool-name');
		if (name) name.textContent = tool.name || tool.id;
		this.summaryStatus.setText(status.label);
		this.summaryStatus.className = `opencode-tool-status ${status.className}`;
		const signature = detailText({ state: tool.state, executed: tool.executed });
		if (signature === this.signature) return;
		this.signature = signature;
		this.body.empty();
		const input = tool.state.status === 'streaming' ? tool.state.input : tool.state.input;
		this.body.createEl('p', { text: 'Input', cls: 'opencode-muted' });
		this.body.createEl('pre', { text: detailText(input) });
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
