# Tasks

## 1. Attachment model and composer affordances

- [x] 1.1 Add a `MessageAttachment` type (`note` carrying a `TFile`, `selection` carrying snapshot text and source path) and a small normalizer in a focused UI module. Verify `npm run build` type-checks and a new unit test covers note/selection shapes and duplicate filtering.
- [x] 1.2 Render attachments as removable chips above the textarea inside the existing composer card, hidden when empty, reusing native button styling. Verify a new composer DOM test shows a chip per attachment and that removing one leaves the typed text unchanged.
- [x] 1.3 Add **Attach selection** and **Attach active note** actions with availability rules: selection only for a non-empty active-editor selection, active note only for an open Markdown note. Verify tests assert each action is shown or hidden for those cases.
- [x] 1.4 Clear chips only after confirmed admission, keeping them for an uncertain send. Verify a composer test covers admitted, uncertain, and recover-and-retry states.

## 2. Reference resolution

- [x] 2.1 Resolve `[[...]]` references at send time to vault files with Obsidian's link resolution, stripping alias, heading, and block fragments; leave unresolved references as text. Verify unit tests cover unique, duplicate, aliased, heading-only, and unresolved references.
- [x] 2.2 Deduplicate resolved notes and explicit note chips by vault path so each file is attached once. Verify a test that mixes a `[[Note]]` reference and a chip for the same note expects one attachment.
- [x] 2.3 Skip a file whose `TFile.stat.size` exceeds 20 MiB with a user-visible notice, without reading its contents. Verify a test with an oversized stub file expects no attachment and a notice.

## 3. Transport and recovery

- [x] 3.1 Extend `PendingPrompt` and `PromptCoordinator.send` with an optional `files` list and pass it through `transmit()` to `client.session.prompt`. Verify `tests/prompt.test.mjs` asserts the request carries the files and `checkInbox` is unchanged.
- [x] 3.2 Make `reconcile()` and `retry()` reuse the same prompt identity and the same files. Verify a test where an unconfirmed prompt with files is retried after reconciliation.
- [x] 3.3 Extend `SynchronizationActions.sendMessage` to accept attachments, prepend the labelled selection block to the transmitted text, build `files` from notes, and keep the composer text unchanged. Verify `tests/synchronization-actions.test.mjs` covers text, skill IDs, and files together.
- [x] 3.4 Wire `ChatView` to collect chips, resolve references, and pass attachments into the send path. Verify `tests/conversation.test.mjs` (or a focused new test) covers the view-to-action handoff.

## 4. Settings and selection semantics

- [x] 4.1 Add an **Attach active note automatically** preference, default off, to persisted settings and the settings tab. Verify `tests/settings.test.mjs` covers the default and round-trip, and the settings tab renders the row.
- [x] 4.2 When the preference is on, attach the active note at send if a Markdown note is open and the note is not already attached; when off, send without it. Verify both branches with a test.
- [x] 4.3 Snapshot selection text at attach time so later editor-selection changes do not alter the message. Verify a test that changes the selection between attach and send.

## 5. Documentation and invariants

- [x] 5.1 Update AGENTS.md: `[[Note]]` stays visible prompt text and attaches the note; the never-auto-attach-active-editor wording gains the opt-in exception; the persisted-data list includes the new preference. Verify the file reads consistently and `npm run lint` passes.
- [x] 5.2 Update README composer and privacy sections to describe context attachment, the off-by-default auto-attach setting, the `file:///` reference (not copied content), and the 20 MiB limit. Verify every documented control exists in the UI copy.
- [x] 5.3 Update `docs/architecture.md` for the composer/send path and `docs/client-contract-review.md` to record `SessionPromptInput.files` and its 2.2.2 stability. Verify the described modules and contract references match the code.

## 6. Integration verification

- [x] 6.1 Run `npm test`, `npm run build`, and `npm run lint`; all three pass.
- [x] 6.2 In a disposable vault, attach a note via `[[`, attach a selection, attach the active note, remove a chip, send, and exercise reconcile-and-retry; record the observed result in `docs/runtime-compatibility.md`.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived specs and the updated AGENTS.md invariants agree.
