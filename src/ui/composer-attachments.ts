import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TFile } from 'obsidian';
import type { PromptFile } from '../state/prompt-coordinator';

/** The service's per-attachment limit; larger files are skipped before any read. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** A vault note sent as a structured file reference. */
export interface NoteAttachment {
	readonly kind: 'note';
	readonly file: TFile;
}

/** Editor text captured at attach time and sent as labelled message text. */
export interface SelectionAttachment {
	readonly kind: 'selection';
	readonly text: string;
	readonly sourcePath: string;
}

/** One item attached to the next message; the composer shows one chip per item. */
export type MessageAttachment = NoteAttachment | SelectionAttachment;

/** The metadata surface reference resolution needs. */
export interface NoteResolver {
	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
}

/** What the composer may offer to attach from the active editor right now. */
export interface AttachmentSources {
	readonly selection: boolean;
	readonly activeNote: boolean;
}

/** The editor and note surfaces availability is read from. */
export interface AttachmentEditor {
	getSelection(): string;
}

/** Offer an action only while its source exists: selected text, or an open Markdown note. */
export function attachmentSources(
	editor: AttachmentEditor | undefined,
	file: { readonly extension?: string } | null | undefined,
): AttachmentSources {
	const selected = editor?.getSelection() ?? '';
	return {
		selection: selected.trim().length > 0,
		activeNote: file?.extension === 'md',
	};
}

/** The service rejects larger attachments; skip it without reading the file. */
export function isOversizedAttachment(file: TFile): boolean {
	return typeof file.stat?.size === 'number' && file.stat.size > MAX_ATTACHMENT_BYTES;
}

/** A note attachment, or `undefined` when the file exceeds the service limit. */
export function noteAttachment(file: TFile): NoteAttachment | undefined {
	return isOversizedAttachment(file) ? undefined : { kind: 'note', file };
}

/**
 * Filters duplicate items so each note attaches once and identical selections
 * collapse, while keeping the order the user attached them in.
 */
export function normalizeAttachments(
	attachments: readonly MessageAttachment[],
): MessageAttachment[] {
	const seen = new Set<string>();
	const result: MessageAttachment[] = [];
	for (const attachment of attachments) {
		const key = attachment.kind === 'note'
			? `note:${attachment.file.path}`
			: `selection:${attachment.sourcePath}\u0000${attachment.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(attachment);
	}
	return result;
}

const NOTE_REFERENCE = /\[\[([^[\]]+)\]\]/gu;

/** Strips an alias, heading, and block fragment from a reference's linkpath. */
export function referenceTarget(raw: string): string {
	const [withoutAlias = ''] = raw.split('|');
	const [withoutHeading = ''] = withoutAlias.split('#');
	const [withoutBlock = ''] = withoutHeading.split('^');
	return withoutBlock.trim();
}

/** Resolves every distinct Markdown note referenced as `[[...]]` in the text. */
export function noteReferences(
	text: string,
	resolver: NoteResolver,
	sourcePath = '',
): TFile[] {
	const files: TFile[] = [];
	const seen = new Set<string>();
	for (const match of text.matchAll(NOTE_REFERENCE)) {
		const target = referenceTarget(match[1] ?? '');
		if (!target) continue;
		let file: TFile | null = null;
		try {
			file = resolver.getFirstLinkpathDest(target, sourcePath);
		} catch {
			file = null;
		}
		// Only notes attach; an image embed or another non-Markdown target stays text.
		if (!file || file.extension !== 'md' || seen.has(file.path)) continue;
		seen.add(file.path);
		files.push(file);
	}
	return files;
}

export interface CollectAttachmentOptions {
	readonly resolver: NoteResolver;
	readonly sourcePath?: string;
	/** The open note to attach automatically, when the setting enables it. */
	readonly activeNote?: TFile | null;
	/** Reports an oversized file that was skipped instead of attached. */
	readonly notify?: (message: string) => void;
}

/**
 * Builds one deduplicated attachment list from explicit chips, `[[...]]`
 * references, and an optional automatically attached active note. Files over
 * the service limit are skipped with a notice and never read.
 */
export function collectAttachments(
	text: string,
	chips: readonly MessageAttachment[],
	options: CollectAttachmentOptions,
): MessageAttachment[] {
	const listed: MessageAttachment[] = [];
	const notify = options.notify ?? (() => undefined);
	for (const attachment of chips) {
		if (attachment.kind === 'note' && isOversizedAttachment(attachment.file)) {
			notify(oversizedMessage(attachment.file));
			continue;
		}
		listed.push(attachment);
	}
	const candidates = noteReferences(text, options.resolver, options.sourcePath);
	if (options.activeNote) candidates.push(options.activeNote);
	const seen = new Set<string>();
	for (const file of candidates) {
		if (seen.has(file.path)) continue;
		seen.add(file.path);
		const attachment = noteAttachment(file);
		if (attachment) listed.push(attachment);
		else notify(oversizedMessage(file));
	}
	return normalizeAttachments(listed);
}

/** Prefixes a labelled selection block to the transmitted text; the typed text stays visible. */
export function composePromptText(text: string, attachments: readonly MessageAttachment[]): string {
	const blocks = attachments
		.filter((attachment): attachment is SelectionAttachment => attachment.kind === 'selection')
		.map((attachment) => `Selected text from [[${linkLabel(attachment.sourcePath)}]]:\n\n${attachment.text}`);
	return blocks.length > 0 ? `${blocks.join('\n\n')}\n\n${text}` : text;
}

/** Converts note attachments to the service's `files` entries, deduplicated by path. */
export interface NoteFileResult {
	readonly files: PromptFile[];
	readonly skipped: TFile[];
}

export function noteFiles(
	attachments: readonly MessageAttachment[],
	vaultRoot: string,
): NoteFileResult {
	const files: PromptFile[] = [];
	const skipped: TFile[] = [];
	const seen = new Set<string>();
	for (const attachment of attachments) {
		if (attachment.kind !== 'note' || seen.has(attachment.file.path)) continue;
		seen.add(attachment.file.path);
		if (isOversizedAttachment(attachment.file)) {
			skipped.push(attachment.file);
			continue;
		}
		files.push({
			uri: pathToFileURL(join(vaultRoot, attachment.file.path)).href,
			name: attachment.file.path,
		});
	}
	return { files, skipped };
}

/** A chip label: the note name, or a short one-line preview of the selection. */
export function attachmentLabel(attachment: MessageAttachment): string {
	if (attachment.kind === 'note') return attachment.file.basename;
	const preview = attachment.text.trim().replace(/\s+/gu, ' ');
	if (!preview) return 'Selection';
	const truncated = preview.length > 40 ? `${preview.slice(0, 40)}…` : preview;
	return `Selection: ${truncated}`;
}

/** The accessible name of a chip's removal control. */
export function attachmentRemoveLabel(attachment: MessageAttachment): string {
	const source = attachment.kind === 'note' ? attachment.file.basename : linkLabel(attachment.sourcePath);
	return `Remove attachment: ${source}`;
}

function linkLabel(sourcePath: string): string {
	return sourcePath.replace(/\.md$/iu, '');
}

function oversizedMessage(file: TFile): string {
	return `${file.basename} is larger than 20 MiB and was not attached.`;
}
