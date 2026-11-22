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
