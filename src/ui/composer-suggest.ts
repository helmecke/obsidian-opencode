import { AbstractInputSuggest, prepareFuzzySearch, sortSearchResults } from 'obsidian';
import type { App, SearchResult, TFile } from 'obsidian';
import type { CommandInfo, SkillInfo } from '@opencode/client';
import {
	applyComposerEdit, commandInsertEdit, commandQueryAt, linkInsertText, linkQueryAt,
	skillMentionEdit, skillQueryAt,
} from './composer-link';

interface RankedNote {
	file: TFile;
	match: SearchResult;
}

interface RankedSkill {
	skill: SkillInfo;
	match: SearchResult;
}

interface RankedCommand {
	command: CommandInfo;
	match: SearchResult;
}

/** One popover row: a vault note, an OpenCode command, or an OpenCode skill. */
export type ComposerSuggestion =
	| { readonly kind: 'note'; readonly file: TFile }
	| { readonly kind: 'command'; readonly command: CommandInfo }
	| { readonly kind: 'skill'; readonly skill: SkillInfo };

/** Lazily loaded, connection-scoped catalogs read by the suggestion list. */
export interface ComposerCatalog {
	/** Requests the skill catalog at most once per connection; failures publish an empty list. */
	loadSkills(): Promise<void>;
	/** The published skill catalog, or `undefined` before the first request completes. */
	getSkills(): readonly SkillInfo[] | undefined;
	/** Requests the command catalog at most once per connection; failures publish an empty list. */
	loadCommands(): Promise<void>;
	/** The published command catalog, or `undefined` before the first request completes. */
	getCommands(): readonly CommandInfo[] | undefined;
}

type Trigger =
	| { readonly kind: 'note'; readonly query: string }
	| { readonly kind: 'command'; readonly query: string }
	| { readonly kind: 'skill'; readonly query: string };

/**
 * Inline completion for the chat composer. It reads the composer value and
 * caret directly because the suggestion base class passes the whole field value.
 * Note links (`[[`) win over slash commands (`/`) and skill mentions (`$`); a
 * command can only start the message, while a skill may follow whitespace.
 */
export class ComposerSuggest extends AbstractInputSuggest<ComposerSuggestion> {
	private readonly inputEl: HTMLInputElement;
	private opened = false;

	constructor(app: App, inputEl: HTMLInputElement, private readonly catalog: ComposerCatalog) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	dispose(): void {
		this.close();
	}

	/** Whether the popover currently owns the keyboard; the composer defers Enter while it does. */
	isCompletionOpen(): boolean {
		return this.opened;
	}

	override open(): void {
		this.opened = true;
		super.open();
	}

	override close(): void {
		this.opened = false;
		super.close();
	}

	protected getSuggestions(_query: string): ComposerSuggestion[] | Promise<ComposerSuggestion[]> {
		const trigger = this.trigger();
		if (!trigger) return [];
		if (trigger.kind === 'note') return this.noteSuggestions(trigger.query);
		return trigger.kind === 'command' ? this.commandSuggestions() : this.skillSuggestions();
	}

	renderSuggestion(entry: ComposerSuggestion, el: HTMLElement): void {
		if (entry.kind === 'note') {
			el.addClass('opencode-note-suggestion');
			el.createDiv({ cls: 'opencode-note-suggestion-name', text: entry.file.basename });
			el.createDiv({ cls: 'opencode-note-suggestion-path', text: folderLabel(entry.file) });
			return;
		}
		if (entry.kind === 'command') {
			el.addClass('opencode-command-suggestion');
			el.createDiv({ cls: 'opencode-command-suggestion-name', text: `/${entry.command.name}` });
			if (entry.command.description) {
				el.createDiv({ cls: 'opencode-command-suggestion-description', text: entry.command.description });
			}
			return;
		}
		el.addClass('opencode-skill-suggestion');
		el.createDiv({ cls: 'opencode-skill-suggestion-name', text: entry.skill.name });
		if (entry.skill.description) {
			el.createDiv({ cls: 'opencode-skill-suggestion-description', text: entry.skill.description });
		}
	}

	selectSuggestion(entry: ComposerSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		if (entry.kind === 'note') {
			this.insertNote(entry.file);
			return;
		}
		const edit = entry.kind === 'command'
			? commandInsertEdit(this.selection(), entry.command.name)
			: skillMentionEdit(this.selection(), entry.skill.name);
		if (!edit) return;
		// setRangeText keeps native undo working; dispatch input for resize and send state.
		applyComposerEdit(this.inputEl, edit);
		this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
		this.close();
	}

	private trigger(): Trigger | null {
		const value = this.inputEl.value;
		const caret = this.inputEl.selectionStart ?? value.length;
		const note = linkQueryAt(value, caret);
		if (note !== null) return { kind: 'note', query: note };
		const command = commandQueryAt(value, caret);
		if (command) return { kind: 'command', query: command.query };
		const skill = skillQueryAt(value, caret);
		return skill ? { kind: 'skill', query: skill.query } : null;
	}

	private noteSuggestions(query: string): ComposerSuggestion[] {
		const files = [...this.app.vault.getMarkdownFiles()].sort((left, right) => left.path.localeCompare(right.path));
		if (query.length === 0) return this.limitResults(files.map(noteSuggestion));
		const search = prepareFuzzySearch(query);
		const ranked: RankedNote[] = [];
		for (const file of files) {
			const match = search(file.basename);
			if (match) ranked.push({ file, match });
		}
		sortSearchResults(ranked);
		return this.limitResults(ranked.map(({ file }) => noteSuggestion(file)));
	}

	private async commandSuggestions(): Promise<ComposerSuggestion[]> {
		await this.catalog.loadCommands();
		// The catalog may resolve after more typing; rank against the current caret.
		const trigger = this.trigger();
		if (!trigger || trigger.kind !== 'command') return [];
		const query = trigger.query;
		const commands = [...(this.catalog.getCommands() ?? [])]
			.sort((left, right) => left.name.localeCompare(right.name));
		if (query.length === 0) return this.limitResults(commands.map(commandSuggestion));
		const search = prepareFuzzySearch(query);
		const ranked: RankedCommand[] = [];
		for (const command of commands) {
			const match = search(command.name);
			if (match) ranked.push({ command, match });
		}
		sortSearchResults(ranked);
		return this.limitResults(ranked.map(({ command }) => commandSuggestion(command)));
	}

	private async skillSuggestions(): Promise<ComposerSuggestion[]> {
		await this.catalog.loadSkills();
		// The catalog may resolve after more typing; rank against the current caret.
		const trigger = this.trigger();
		if (!trigger || trigger.kind !== 'skill') return [];
		const query = trigger.query;
		const skills = [...(this.catalog.getSkills() ?? [])].sort((left, right) => left.name.localeCompare(right.name));
		if (query.length === 0) return this.limitResults(skills.map(skillSuggestion));
		const search = prepareFuzzySearch(query);
		const ranked: RankedSkill[] = [];
		for (const skill of skills) {
			const match = search(skill.name);
			if (match) ranked.push({ skill, match });
		}
		sortSearchResults(ranked);
		return this.limitResults(ranked.map(({ skill }) => skillSuggestion(skill)));
	}

	private insertNote(file: TFile): void {
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

	private selection(): { value: string; selectionStart: number; selectionEnd: number } {
		return {
			value: this.inputEl.value,
			selectionStart: this.inputEl.selectionStart ?? this.inputEl.value.length,
			selectionEnd: this.inputEl.selectionEnd ?? this.inputEl.value.length,
		};
	}

	private isUnique(file: TFile): boolean {
		const matches = this.app.vault.getMarkdownFiles()
			.filter((candidate) => candidate.basename === file.basename);
		return matches.length <= 1;
	}

	private limitResults<T>(entries: T[]): T[] {
		return this.limit > 0 ? entries.slice(0, this.limit) : entries;
	}
}

function noteSuggestion(file: TFile): ComposerSuggestion {
	return { kind: 'note', file };
}

function commandSuggestion(command: CommandInfo): ComposerSuggestion {
	return { kind: 'command', command };
}

function skillSuggestion(skill: SkillInfo): ComposerSuggestion {
	return { kind: 'skill', skill };
}

function folderLabel(file: TFile): string {
	const folder = file.parent?.path ?? '';
	return folder.length > 0 ? `${folder}/` : '/';
}
