/** Text and selection state of the composer field. */
export interface ComposerSelection {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

/** A new composer value with the collapsed caret or selection to apply. */
export type ComposerEdit = ComposerSelection;

/**
 * Returns the text after the last unclosed `[[` before the caret, or `null`
 * when no link is being typed. A `]]` before the caret closes the link.
 */
export function linkQueryAt(text: string, caret: number): string | null {
	const position = Math.max(0, Math.min(caret, text.length));
	const before = text.slice(0, position);
	const opener = before.lastIndexOf('[[');
	if (opener < 0) return null;
	const query = before.slice(opener + 2);
	return query.includes(']]') ? null : query;
}

/**
 * Link text that resolves to `basename` from the vault root. A unique basename
 * stays bare; otherwise the vault-relative folder path disambiguates it.
 */
export function linkInsertText(basename: string, folder: string, unique: boolean): string {
	const segments = folder.replace(/\\/g, '/').split('/').filter((segment) => segment.length > 0 && segment !== '.');
	const target = unique ? basename : [...segments, basename].join('/');
	return `[[${target}]]`;
}

/** A leading `/` command query at the caret; it always starts the message. */
export interface CommandQuery {
	readonly query: string;
	readonly start: number;
}

/**
 * Returns the command query at the caret, or `null` unless the message starts
 * with `/` and the caret stays inside that first whitespace-delimited token.
 * Nested names may contain `/`; a caret in the arguments has no query.
 */
export function commandQueryAt(text: string, caret: number): CommandQuery | null {
	const position = clamp(caret, text.length);
	if (position < 1 || text.charAt(0) !== '/') return null;
	const before = text.slice(0, position);
	if (/\s/u.test(before)) return null;
	return { query: text.slice(1, position), start: 0 };
}

/** Replaces the leading `/` query through the caret with `/name ` and leaves the caret after the space. */
export function commandInsertEdit(state: ComposerSelection, name: string): ComposerEdit | null {
	const caret = clamp(state.selectionStart, state.value.length);
	const trigger = commandQueryAt(state.value, caret);
	if (!trigger) return null;
	const insertion = `/${name} `;
	const value = `${state.value.slice(0, trigger.start)}${insertion}${state.value.slice(caret)}`;
	const position = trigger.start + insertion.length;
	return { value, selectionStart: position, selectionEnd: position };
}

/** An eligible `$` skill query at the caret and the index of its `$`. */
export interface SkillQuery {
	readonly query: string;
	readonly start: number;
}

/** A `$name` mention found in text, with the span of the token. */
export interface SkillMention {
	readonly name: string;
	readonly start: number;
	readonly end: number;
}

/**
 * Returns the skill query at the caret, or `null` when no eligible `$` starts
 * the current token. A `$` must begin the input or follow whitespace, and the
 * caret must follow it with no whitespace in between; so `word$` and `$skill
 * name` have no query.
 */
export function skillQueryAt(text: string, caret: number): SkillQuery | null {
	const position = Math.max(0, Math.min(caret, text.length));
	let start = position;
	while (start > 0 && !isWhitespace(text.charAt(start - 1))) start--;
	if (start >= position || text.charAt(start) !== '$') return null;
	const query = text.slice(start + 1, position);
	return query.includes('$') ? null : { query, start };
}

/**
 * Every `$name` mention in `text`, using the same boundary rule as the picker:
 * the `$` starts the text or follows whitespace and the name has no whitespace.
 */
export function skillMentions(text: string): SkillMention[] {
	const mentions: SkillMention[] = [];
	const pattern = /(^|\s)\$([^\s$]+)/gu;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const prefix = match[1] ?? '';
		const name = match[2] ?? '';
		if (!name) continue;
		const start = match.index + prefix.length;
		mentions.push({ name, start, end: start + name.length + 1 });
	}
	return mentions;
}

/** Replaces the query after its `$` with `$name ` and leaves the caret after the space. */
export function skillMentionEdit(state: ComposerSelection, name: string): ComposerEdit | null {
	const caret = clamp(state.selectionStart, state.value.length);
	const trigger = skillQueryAt(state.value, caret);
	if (!trigger) return null;
	const mention = `$${name} `;
	const value = `${state.value.slice(0, trigger.start)}${mention}${state.value.slice(caret)}`;
	const position = trigger.start + mention.length;
	return { value, selectionStart: position, selectionEnd: position };
}

/** Wraps the selection in brackets, or inserts an empty pair with the caret between. */
export function applyOpenBracket(state: ComposerSelection): ComposerEdit {
	const start = clamp(state.selectionStart, state.value.length);
	const end = clamp(state.selectionEnd, state.value.length);
	const selected = state.value.slice(start, end);
	const value = `${state.value.slice(0, start)}[${selected}]${state.value.slice(end)}`;
	const caret = start + 1 + selected.length + (selected.length > 0 ? 1 : 0);
	return { value, selectionStart: caret, selectionEnd: caret };
}

/** Skips over an existing closer, or inserts one replacing the selection. */
export function applyCloseBracket(state: ComposerSelection): ComposerEdit {
	const start = clamp(state.selectionStart, state.value.length);
	const end = clamp(state.selectionEnd, state.value.length);
	if (start === end && state.value.charAt(start) === ']') {
		return { value: state.value, selectionStart: start + 1, selectionEnd: start + 1 };
	}
	const value = `${state.value.slice(0, start)}]${state.value.slice(end)}`;
	const caret = start + 1;
	return { value, selectionStart: caret, selectionEnd: caret };
}

/** Removes both halves of an empty pair directly around the caret; otherwise `null`. */
export function deleteEmptyPair(state: ComposerSelection): ComposerEdit | null {
	const start = clamp(state.selectionStart, state.value.length);
	const end = clamp(state.selectionEnd, state.value.length);
	if (start !== end || start === 0) return null;
	if (state.value.charAt(start - 1) !== '[' || state.value.charAt(start) !== ']') return null;
	const value = `${state.value.slice(0, start - 1)}${state.value.slice(start + 1)}`;
	const caret = start - 1;
	return { value, selectionStart: caret, selectionEnd: caret };
}

/**
 * Applies an edit through `setRangeText` so native undo keeps working, then
 * restores the requested selection. The caller dispatches `input`.
 */
export function applyComposerEdit(element: HTMLTextAreaElement | HTMLInputElement, edit: ComposerEdit): void {
	const current = element.value;
	if (current !== edit.value) {
		const prefix = commonPrefixLength(current, edit.value);
		const suffix = commonSuffixLength(current, edit.value, prefix);
		const insertion = edit.value.slice(prefix, edit.value.length - suffix);
		element.setRangeText(insertion, prefix, current.length - suffix, 'end');
	}
	element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

function clamp(position: number, length: number): number {
	if (!Number.isFinite(position)) return length;
	return Math.max(0, Math.min(position, length));
}

function isWhitespace(character: string): boolean {
	return /\s/u.test(character);
}

function commonPrefixLength(left: string, right: string): number {
	const limit = Math.min(left.length, right.length);
	let index = 0;
	while (index < limit && left.charAt(index) === right.charAt(index)) index++;
	return index;
}

function commonSuffixLength(left: string, right: string, prefix: number): number {
	const limit = Math.min(left.length, right.length) - prefix;
	let index = 0;
	while (index < limit && left.charAt(left.length - 1 - index) === right.charAt(right.length - 1 - index)) index++;
	return index;
}
