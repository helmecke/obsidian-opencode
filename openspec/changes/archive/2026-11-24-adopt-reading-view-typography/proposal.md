# Proposal

## Why

Assistant answers in the chat are not rendered with Obsidian's reading typography. Measured in a live vault, answer prose is 15px at a 1.3 line height in `--font-interface`, while the same text in a note's reading view is 16px at 1.5 in `--font-text`. Block spacing collapses entirely at the seams between parts, because every part is its own `markdown-rendered` root and the host zeroes the margin of a first and last child.

The `native-chat` specification already requires answers to use native reading typography and block spacing. The shortfall comes from an assumption recorded in an archived design: that `markdown-rendered` alone supplies reading typography. It does not. Obsidian puts that typography on `.markdown-preview-view`; a `markdown-rendered` subtree without it inherits the `body` interface defaults.

## What Changes

- The transcript scroll container carries Obsidian's reading-view class, so the host supplies the text font, size, line height, block margins, and stable scrollbar gutter. The plugin stops approximating them.
- One spacing step governs the transcript: the theme's paragraph token separates prose blocks, a tool or reasoning group, and both sides of a turn, with no plugin spacing token of its own. This replaces the earlier rule that allowed space only between turns.
- The transcript and the composer adopt `--file-margins` for the reading measure, so note margins and pane width arrive from the theme instead of a plugin-derived inset.
- The chat view root stops repainting colour, pane background, and base font size on the element Obsidian already styles as view content. It keeps its layout.
- The user prompt becomes a prompt-type callout titled **You** with a leading icon and the host's callout tint, instead of a blockquote that reads as a quotation.
- Rendered lists get the host's list-marker markup, which Obsidian adds only while building a reading-view preview and the plugin's renderer never receives, so a chat bullet matches a note's colour, size, and radius.
- Tests assert the reading-view class on the transcript, the single spacing step, the prompt callout markup, the list-marker pass, and the absence of root typography or a plugin spacing token, so the assumption cannot silently return.
- The end-of-run footnote, disclosures, status line, and composer card keep their UI sizing; this change moves prose and block spacing, not chat chrome.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: the **Document-like transcript** requirement names the reading surface the transcript inherits from and the prompt block, and its **Assistant document flow** scenario replaces "space only between turns" with one theme paragraph step across prose, detail groups, and both sides of a turn, plus the host's list markers.

## Impact

- `src/ui/chat-renderer.ts`: the transcript container gains the host reading-view class.
- `src/ui/conversation.ts`: the prompt becomes a prompt-type callout instead of a blockquote.
- `src/ui/markdown.ts`: rendered lists receive the host's list-marker markup after each render.
- `styles.css`: reading typography and inline inset removed from the plugin's own declarations; one spacing step and the file margins added.
- `tests/`: DOM assertions for the container class, the prompt callout, the list markers, and the retained rules.
- `README.md`, `CHANGELOG.md`, and `docs/runtime-compatibility.md`: transcript behaviour text and verification evidence.
- No API, dependency, persisted-data, or service-contract change.
