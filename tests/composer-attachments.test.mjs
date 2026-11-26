import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/ui/composer-attachments.ts'], bundle: true,
	format: 'cjs', platform: 'node', external: ['obsidian'], write: false });
const module = { exports: {} };
compileFunction(bundle.outputFiles[0].text, ['require', 'module', 'exports'])(
	(name) => name === 'obsidian' ? {} : createRequire(import.meta.url)(name), module, module.exports);
const {
	MAX_ATTACHMENT_BYTES, attachmentLabel, attachmentRemoveLabel, attachmentSources,
	collectAttachments, composePromptText, isOversizedAttachment, noteAttachment,
	noteFiles, noteReferences, normalizeAttachments, referenceTarget,
} = module.exports;

const vaultRoot = 'C:\\Vault';
const file = (path, size = 10, extension = 'md') => ({
	path,
	basename: path.split('/').at(-1).replace(/\.[^.]+$/u, ''),
	extension,
	stat: { size },
});
const note = (path) => ({ kind: 'note', file: file(path) });
const selection = (text, sourcePath = 'Notes/Idea.md') => ({ kind: 'selection', text, sourcePath });
const resolver = (targets) => ({
	getFirstLinkpathDest(linkpath, sourcePath) {
		const match = targets[linkpath];
		if (typeof match === 'function') return match(sourcePath);
		return match ?? null;
	},
});

test('note and selection shapes normalize with one note per path and one chip per identical selection', () => {
	const idea = file('Notes/Idea.md');
	const other = file('Notes/Other.md');
	const samePath = file('Notes/Idea.md');
	const list = [
		{ kind: 'note', file: idea },
		{ kind: 'selection', text: 'quoted', sourcePath: 'Notes/Idea.md' },
		{ kind: 'note', file: samePath },
		{ kind: 'selection', text: 'quoted', sourcePath: 'Notes/Idea.md' },
		{ kind: 'selection', text: 'other', sourcePath: 'Notes/Idea.md' },
		{ kind: 'note', file: other },
	];
	const normalized = normalizeAttachments(list);
	assert.deepEqual(normalized.map((attachment) => attachment.kind), ['note', 'selection', 'selection', 'note']);
	assert.equal(normalized[0].file, idea, 'The first file object is kept');
	assert.equal(normalized.at(-1).file, other);

	assert.deepEqual(noteAttachment(idea), { kind: 'note', file: idea });
	assert.equal(noteAttachment({ ...idea, stat: { size: MAX_ATTACHMENT_BYTES + 1 } }), undefined);
	assert.equal(isOversizedAttachment({ stat: { size: MAX_ATTACHMENT_BYTES } }), false,
		'Exactly the limit is still attachable');
});

test('availability follows a non-empty selection and an open Markdown note', () => {
	assert.deepEqual(attachmentSources({ getSelection: () => 'words' }, { extension: 'md' }),
		{ selection: true, activeNote: true });
	assert.deepEqual(attachmentSources({ getSelection: () => '  \n ' }, { extension: 'md' }),
		{ selection: false, activeNote: true });
	assert.deepEqual(attachmentSources(undefined, null), { selection: false, activeNote: false });
	assert.deepEqual(attachmentSources(undefined, { extension: 'canvas' }),
		{ selection: false, activeNote: false }, 'Only a Markdown note is attachable');
});

test('references strip aliases, headings, and blocks and resolve through Obsidian', () => {
	const idea = file('Notes/Idea.md');
	assert.equal(referenceTarget('Notes/Idea|Alias'), 'Notes/Idea');
	assert.equal(referenceTarget('Notes/Idea#Heading'), 'Notes/Idea');
	assert.equal(referenceTarget('Notes/Idea#^block'), 'Notes/Idea');
	assert.equal(referenceTarget('Notes/Idea^block'), 'Notes/Idea');

	const resolve = resolver({ Idea: idea });
	assert.deepEqual(noteReferences('One [[Idea]] and [[Idea]] again', resolve), [idea],
		'Duplicate references collapse to one note');
	assert.deepEqual(noteReferences('[[Idea|alias]] [[Idea#Heading]] [[Idea#^block]] [[Idea^block]]', resolve), [idea]);
	assert.deepEqual(noteReferences('[[#Heading only]] and [[Missing]]', resolve), [],
		'A heading-only or unresolved reference stays text');
	assert.deepEqual(noteReferences('[[pic.png]]', resolver({ 'pic.png': file('pic.png', 10, 'png') })), [],
		'Non-Markdown targets are not note attachments');
	assert.deepEqual(noteReferences('No references here', resolve), []);
});

test('references use the supplied source context and never throw on a failed lookup', () => {
	const idea = file('Notes/Idea.md');
	const seen = [];
	assert.deepEqual(noteReferences('[[Idea]]', {
		getFirstLinkpathDest(linkpath, sourcePath) { seen.push([linkpath, sourcePath]); return idea; },
	}, 'Folder/Source.md'), [idea]);
	assert.deepEqual(seen, [['Idea', 'Folder/Source.md']]);
	assert.deepEqual(noteReferences('[[Idea]]', {
		getFirstLinkpathDest() { throw new Error('metadata unavailable'); },
	}), [], 'A failed resolution leaves the reference as text');
});

test('collecting mixes chips, references, and an active note into one deduplicated list', () => {
	const idea = file('Notes/Idea.md');
	const result = collectAttachments('Use [[Notes/Idea]]', [selection('quoted'), note('Notes/Idea.md')], {
		resolver: resolver({ 'Notes/Idea': idea }),
		activeNote: { ...idea },
	});
	assert.deepEqual(result.map((attachment) => attachment.kind), ['selection', 'note'],
		'The reference, the chip, and the active note for one path attach once');
	assert.equal(result[1].file.path, 'Notes/Idea.md');
});

test('an oversized note is skipped without reading it and reported once', () => {
	const huge = file('Notes/Huge.md', MAX_ATTACHMENT_BYTES + 1);
	const notices = [];
	const result = collectAttachments('Attach [[Huge]]', [], {
		resolver: resolver({ Huge: huge }),
		notify: (message) => notices.push(message),
	});
	assert.deepEqual(result, []);
	assert.deepEqual(notices, ['Huge is larger than 20 MiB and was not attached.']);

	const chipNotices = [];
	assert.deepEqual(collectAttachments('', [{ kind: 'note', file: huge }], {
		resolver: resolver({}), notify: (message) => chipNotices.push(message),
	}), []);
	assert.deepEqual(chipNotices, ['Huge is larger than 20 MiB and was not attached.']);
});

test('note files are file:/// references with a vault-relative name, deduplicated by path', () => {
	const idea = file('Notes/Idea.md');
	const huge = file('Notes/Huge.md', MAX_ATTACHMENT_BYTES + 1);
	const result = noteFiles([note('Notes/Idea.md'), { kind: 'note', file: idea },
		{ kind: 'note', file: huge }, selection('text')], vaultRoot);
	assert.deepEqual(result.files, [{
		uri: pathToFileURL(join(vaultRoot, 'Notes/Idea.md')).href,
		name: 'Notes/Idea.md',
	}]);
	assert.match(result.files[0].uri, /^file:\/\/\//u);
	assert.deepEqual(result.skipped.map((entry) => entry.path), ['Notes/Huge.md']);
	assert.deepEqual(noteFiles([], vaultRoot), { files: [], skipped: [] });
});

test('selection snapshots are prepended as a labelled block while the typed text stays intact', () => {
	assert.equal(composePromptText('typed', []), 'typed');
	assert.deepEqual(composePromptText('typed', [note('A.md')]), 'typed', 'Notes do not change the text');
	assert.equal(composePromptText('typed', [selection('quoted words', 'Folder/Note.md')]),
		'Selected text from [[Folder/Note]]:\n\nquoted words\n\ntyped');
	assert.equal(composePromptText('typed', [selection('one'), selection('two')]),
		'Selected text from [[Notes/Idea]]:\n\none\n\nSelected text from [[Notes/Idea]]:\n\ntwo\n\ntyped');
});

test('chip labels name the note or preview the selection and its removal target', () => {
	assert.equal(attachmentLabel(note('Folder/Plan.md')), 'Plan');
	assert.equal(attachmentLabel(selection('  A short\nline  ')), 'Selection: A short line');
	const long = 'x'.repeat(60);
	assert.equal(attachmentLabel(selection(long)), `Selection: ${'x'.repeat(40)}…`);
	assert.equal(attachmentLabel(selection('   ')), 'Selection');
	assert.equal(attachmentRemoveLabel(note('Folder/Plan.md')), 'Remove attachment: Plan');
	assert.equal(attachmentRemoveLabel(selection('text', 'Folder/Plan.md')), 'Remove attachment: Folder/Plan');
});
