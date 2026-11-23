# Tasks

## 1. Document shells and quiet records

- [x] 1.1 In `src/ui/conversation.ts`, remove the visible **You** and **OpenCode** role elements, give each entry an accessible group label, render the user prompt as a `<blockquote>` aside with preserved whitespace, and leave the assistant body unframed and filling the reading column's width. Verify with a new `tests/conversation.test.mjs` run under `npm test` that asserts the blockquote markup, accessible labels, absence of visible role text, user/assistant body classes, and pending-prompt status.
- [x] 1.2 In `src/ui/conversation.ts`, filter known routine records before entry creation (successful `idle`, `agent-switched`, `model-selected`, `location-switched`), render failed/interrupted `idle` as a compact outcome line with error detail, render `compaction` as a compact line, and render `shell`, `skill`, `synthetic`, `system`, and unknown records as collapsed disclosures with short labels. Verify the renderer test asserts suppressed records are absent, failure text and error are present, shell output is reachable on expansion, injected text is not Markdown-rendered, and unknown types do not print their raw type name.

## 2. End-of-run footnote

- [x] 2.1 Extend `ConversationOptions` and `src/ui/chat-renderer.ts` with model and agent label resolvers backed by the refreshed `models` and `agents` state, falling back to the message's IDs. Add one faint footnote-like line to the last assistant message of each contiguous run with the available model, agent, and turn duration. Verify the renderer test covers resolved and fallback labels, `0.4s`/`13.4s`/`1m 12s` formatting, placement only on the final message of a run, omission of missing values, no footnote while the run is still streaming, and no visible control or badge in the line.

## 3. Compact tool activity inside the document

- [x] 3.1 Rework `src/ui/tool-entry.ts` so the summary shows a muted tool icon via `setIcon`, the tool name, a status or formatted duration, and a single-line input preview, while expanded input, result, and error blocks keep their existing text-only rendering. Verify `tests/interactions.test.mjs` asserts the preview, duration, icon, and status for completed, running, failed, and streaming states, and still asserts that output is never evaluated as HTML.
- [x] 3.2 Cover tool edge cases in the same test file: missing timestamps, long or multiline previews, and non-string input values. Verify the preview stays one line and truncates instead of widening the document column.
- [x] 3.3 Give reasoning the same summary row as tools: a muted icon, the name, and a one-line preview of its text. Share one disclosure affordance so the icon becomes a chevron on hover or keyboard focus and turns down while open. Verify the renderer test asserts the reasoning icon, name, stripped preview, preserved Markdown body, in-place preview updates, hidden empty preview, and chevron markup; extend the tool test with the chevron.

## 4. Document reading layout

- [x] 4.1 Update `styles.css` to remove the role, assistant-card, and tool-card rules; center the transcript content at Obsidian's note measure with inline padding derived from `--file-line-width` while **Readable line length** is enabled; remove the per-entry and per-part gaps inside assistant runs; style the quoted prompt, faint footnote, reasoning and tool folds, and compact notice lines with existing theme variables. Verify the blockquote treatment against the installed `app.css`, confirm no hard-coded color, pixel font size, shadow, or copied component declaration was added, and run `npm test` to catch selector regressions.
- [x] 4.2 Load the build in the disposable test vault and verify a long answer with headings, paragraphs, lists, blockquotes, code blocks, and tables in light and dark themes plus a narrow sidebar: the prompt reads as a quoted aside, the answer reads as one Markdown document, only turns are separated, the footnote is faint, folds open by keyboard and mouse, long tool previews truncate, and no horizontal scrolling appears.
- [x] 4.3 Mirror Obsidian's readable line length in the chat view: apply the native `is-readable-line-width` class from `Vault.getConfig("readableLineLength")`, follow the vault's `config-changed` event, and release the transcript to the pane width when the setting is off. Verify in the disposable vault that the class and the measured column follow the setting both ways and that a theme or snippet retuning `--file-line-width` changes the column.
- [x] 4.4 Give the composer card the same reading measure as the transcript, sharing one inset rule so the setting governs both. Verify in the disposable vault that the card's left edge aligns with the transcript content while **Readable line length** is on, that it spans the pane with the base inset when off, and that the toolbar still wraps without horizontal scrolling.

## 5. Documentation

- [x] 5.1 Update the transcript description in `README.md` under **Use the chat** so it matches the document-like presentation: a quoted prompt aside, one reading column, continuous native Markdown for answers, the faint end-of-run footnote, compact folds, and the composer as the execution-status surface. Verify every described behavior matches the implemented DOM and that no internal class name appears in the README.
- [x] 5.2 Add an Unreleased `CHANGELOG.md` entry that names the user-visible outcome without claiming new chat features, and verify it mentions the note-like transcript and retained failure visibility.

## 6. Integration verification

- [x] 6.1 Run `npm test`, `npm run build`, and `npm run lint` and verify all three succeed.
- [x] 6.2 Inspect `git diff --stat` and `git diff` for the touched files and verify no protocol, persistence, manifest, dependency, generated artifact, or unrelated change is included.
- [x] 6.3 Reload the disposable vault once more with the final build and verify the accepted transcript state, composer status after a successful and a failed run, and that saved conversations still reopen unchanged. Record any accepted deviation in `docs/runtime-compatibility.md`.

## Workflow follow-up

- Archive the change after review and acceptance; verify the archived change still has the `native-chat` delta and the updated `openspec/specs/native-chat/spec.md` behavior.
