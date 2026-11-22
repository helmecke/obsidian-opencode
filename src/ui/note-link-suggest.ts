import { AbstractInputSuggest, prepareFuzzySearch, sortSearchResults } from 'obsidian';
import type { App, KeymapEventHandler, SearchResult, TFile } from 'obsidian';
import { linkInsertText, linkQueryAt } from './composer-link';

interface RankedNote {
	file: TFile;
	match: SearchResult;
}

/**
 * Inline note completion for the chat composer. It reads the composer value and
 * caret directly because the suggestion base class passes the whole field value.
 */
export class NoteLinkSuggest extends AbstractInputSuggest<TFile> {
	private readonly inputEl: HTMLInputElement;
	private readonly sendKey: KeymapEventHandler;

	constructor(app: App, inputEl: HTMLInputElement, private readonly onSend: () => void) {
		super(app, inputEl);
		this.inputEl = inputEl;
		// The popover owns the active scope while open, so Mod+Enter must be
		// handled here or the editor shortcut never reaches the view.
		this.sendKey = this.scope.register(['Mod'], 'Enter', (event) => {
			if (this.inputEl.ownerDocument.activeElement !== this.inputEl) return true;
			if (event.repeat) return true;
			this.close();
			this.onSend();
			return false;
		});
	}

	dispose(): void {
		this.scope.unregister(this.sendKey);
		this.close();
	}

	protected getSuggestions(_query: string): TFile[] {
		const query = this.query();
		if (query === null) return [];
		const files = [...this.app.vault.getMarkdownFiles()].sort((left, right) => left.path.localeCompare(right.path));
		if (query.length === 0) return this.limitResults(files);
		const search = prepareFuzzySearch(query);
		const ranked: RankedNote[] = [];
		for (const file of files) {
			const match = search(file.basename);
			if (match) ranked.push({ file, match });
		}
		sortSearchResults(ranked);
		return this.limitResults(ranked.map(({ file }) => file));
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.addClass('opencode-note-suggestion');
		el.createDiv({ cls: 'opencode-note-suggestion-name', text: file.basename });
		el.createDiv({ cls: 'opencode-note-suggestion-path', text: folderLabel(file) });
	}

	selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		const value = this.inputEl.value;
		const caret = this.inputEl.selectionStart ?? value.length;
		const query = linkQueryAt(value, caret);
		if (query === null) return;
		const start = caret - query.length - 2;
		const insertion = linkInsertText(file.basename, file.parent?.path ?? '', this.isUnique(file));
		const end = value.startsWith(']]', caret) ? caret + 2 : caret;
		this.inputEl.setRangeText(insertion, start, end, 'end');
		this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
		this.close();
	}

	private query(): string | null {
		const value = this.inputEl.value;
		return linkQueryAt(value, this.inputEl.selectionStart ?? value.length);
	}

	private isUnique(file: TFile): boolean {
		const matches = this.app.vault.getMarkdownFiles()
			.filter((candidate) => candidate.basename === file.basename);
		return matches.length <= 1;
	}

	private limitResults(files: TFile[]): TFile[] {
		return this.limit > 0 ? files.slice(0, this.limit) : files;
	}
}

function folderLabel(file: TFile): string {
	const folder = file.parent?.path ?? '';
	return folder.length > 0 ? `${folder}/` : '/';
}
