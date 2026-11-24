# Tasks

## 1. Transcript reading surface

- [x] 1.1 In `src/ui/chat-renderer.ts`, create the transcript container with both `opencode-chat-messages` and Obsidian's `markdown-preview-view` class. Verify `tests/plugin-shell.test.mjs` asserts both classes on the transcript element and still passes under `npm test`.
- [x] 1.2 In `styles.css`, keep the transcript's chat-specific layout (`flex: 1`, `min-height: 0`, `overflow-y: auto`, `overflow-wrap: anywhere`) and add `height: auto` so the host reading-view height does not overflow the composer's flex column; drop the plugin's `padding-block` and base `padding-inline` so the host's `--file-margins` apply. Verify in the development vault with the composer visible: no overflow, block padding equals `--file-margins`.
- [x] 1.3 Rewrite the readable-width inset rule to `padding-inline: max(var(--file-margins-x), calc((100% - var(--file-line-width)) / 2))` on both the transcript and the composer, so the note margin is the floor and the composer keeps the shared measure. Verify in the development vault: the composer's left edge aligns with answer text with the setting on, and both use `--file-margins-x` with it off.

## 2. Block spacing

- [x] 2.1 Add the seam rules: prose to prose, prose against a tool or reasoning group, and both sides of a turn all use `--p-spacing`, with a group's own rows tight, including where a message split lands on a group edge, and no plugin spacing token declared. Verify with `npm test` and in the vault by measuring prose to prose, prose to group, group to prose, row to row, and a group edge that crosses two messages.
- [x] 2.2 Confirm one spacing step still governs turns and blocks: both sides of a prompt and the seam between two blocks measure the same, while a group's own rows measure zero. Verify in the vault by measuring above and below a prompt, the seam between two blocks of the preceding answer, and two adjacent tool rows.

## 3. View root inheritance

- [x] 3.1 Remove `color`, `background-color`, and `font-size` from `.opencode-chat` in `styles.css`, keeping layout declarations only. Verify in the vault that answer text colour matches a note's and the pane background shows through; verify with `npm run lint` that no unused selector remains.
- [x] 3.2 Extend the shell or renderer test to assert the retained root rules: no text colour, pane background, or base font size declared on the chat root, and the layout declarations present. Verify `npm test` passes and the assertion fails when one of the removed declarations is reintroduced.

## 4. Prompt block

- [x] 4.1 In `src/ui/conversation.ts`, render the user prompt as a `callout` with `data-callout="prompt"`, a **You** title carrying a pencil icon, and the text in `callout-content > p`, keeping the frame `markdown-rendered` and the plain, whitespace-preserving text. Verify `tests/conversation.test.mjs` asserts the callout type, the icon, the title, the preserved newlines, and that neither prompt nor answer renders a blockquote; run `npm test`.
- [x] 4.2 In `styles.css`, drop the blockquote rules and give the turn boundary the space after a prompt, since the host zeroes the callout's own edge margins. Verify in the vault that the box uses the theme's callout tint and padding, that a prompt sits the same distance from its neighbours above and below, that the pending **Sending…** line still sits below the box, and that a narrow pane wraps the prompt without horizontal scrolling.

## 5. List markers

- [x] 5.1 In `src/ui/markdown.ts`, after each render, add `has-list-bullet` to every non-task `ul` and prepend one `<span class="list-bullet">` per list item, leaving `ol` and task-list checkboxes untouched. Verify a markdown test asserts the class on a bullet list, one span per item in source order, a task list left without the class, and an ordered list unchanged; run `npm test`.
- [x] 5.2 Verify in the vault that a chat bullet matches a note's in colour (`--list-marker-color`), size (`--list-bullet-size`), and radius, that the match holds while an answer streams and after a nested list renders, and that task-list checkboxes still show. Record the measured comparison in `docs/runtime-compatibility.md`.

## 6. Verification

- [x] 6.1 Run `npm test`, `npm run build`, and `npm run lint`; all three pass with no generated artifact committed.
- [x] 6.2 In the development vault, verify at a wide pane and a narrow sidebar: readable line length on and off, text size and line height equal to a note's, reading-view-scoped snippet change reflected in the chat without a reload, the composer still aligned, keyboard focus unchanged, and an expanded tool disclosure readable in the flow. Record the accepted deviation — no disposable vault exists on this machine, so that pass and a non-default theme remain outstanding — in `docs/runtime-compatibility.md`.

## 7. Documentation

- [x] 7.1 Update the **Reading the transcript** section of `README.md` so it describes the prompt callout, the reading typography and note margins, and the single spacing step. Verify every described behaviour matches the implemented DOM and that no internal class name appears in the README.
- [x] 7.2 Record the change in `docs/runtime-compatibility.md`: the measured before-and-after typography table, the prompt callout measurement, the list-marker comparison from 5.2, and the metrics-table row with the final task count and passing test count.
- [x] 7.3 Add the Unreleased `CHANGELOG.md` bullet describing the user-visible outcome without claiming a new feature.

## Workflow follow-up

- Traceability check: no TRACEABILITY manifest exists; the runtime-compatibility metrics table is the project's traceability row.
- Archive the change after review and acceptance.
