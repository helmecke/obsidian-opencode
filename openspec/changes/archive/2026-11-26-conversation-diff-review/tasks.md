# Tasks

## 1. Diff data layer

- [x] 1.1 Add a diff accessor in `src/opencode/` that wraps `client.session.diff({ sessionID, from?, to? })` and maps missing-session and transport failures to the existing error types; verify `npm run build` passes and the accessor is exercised by a new unit test.
- [x] 1.2 Add a pure bounds helper that derives a turn's `{ from, to }` from an assistant message's `snapshot` and the conversation's first-start/last-end bounds; verify a unit test covers present, partial, and absent snapshot fields.
- [x] 1.3 Add a per-view in-memory diff cache keyed by `sessionID|from|to` with a clear path on conversation switch; verify a unit test confirms keys are evicted on switch and never written to disk.

## 2. Patch rendering

- [x] 2.1 Implement a pure unified-diff parser that classifies added, removed, and context lines from the server's `patch` string; verify a unit test covers hunk headers, added/removed/context lines, and empty input.
- [x] 2.2 Implement the patch renderer with per-file header (name, status, additions/deletions), add/remove/context tints, soft wrapping with hanging indent, and a per-file render cap with a **Show full patch** control; verify a DOM test confirms the header, tints, wrapping, and cap.
- [x] 2.3 Handle degraded patches: `more: true` shows a partial label, an empty or binary patch shows a status note, and non-text output is never rendered as HTML; verify a DOM test covers each case.

## 3. Turn disclosure

- [x] 3.1 Render a collapsed changed-files disclosure in `ConversationRenderer` after an assistant turn whose `snapshot.files` is non-empty, reusing the disclosure pattern, and omit it otherwise; verify a DOM test asserts presence for a turn with files and absence without.
- [x] 3.2 On disclosure expansion, lazily fetch the turn diff via the accessor, populate the per-file list, and show a compact error with **Retry** on failure; verify a DOM test covers the fetch-on-expand and error paths with a stubbed accessor.

## 4. Session review modal

- [x] 4.1 Add `SessionDiffReviewModal` that fetches the conversation-bounded diff on open, lists files with counts, and expands per file; verify a DOM test covers the flat list, counts, and per-file expansion.
- [x] 4.2 Add per-file open (existing link behavior) and copy-patch actions, with open disabled for deleted and outside-vault files; verify a DOM test covers open enabled/disabled and copy.
- [x] 4.3 Add the document-menu item and the `Review changes in this conversation` command that open the modal; verify a test covers menu wiring and the command registration in `main.ts`.

## 5. Failure isolation

- [x] 5.1 Ensure a failed diff never alters transcript, execution, permissions, or connection state, and does not add `session.diff` to the required contract; verify a test asserts the reducer and composer state are untouched after a stub failure.

## 6. Styling and accessibility

- [x] 6.1 Add diff styles using existing theme variables for tints, wrapping, and muted text, with no hard-coded colors or base font size; verify `npm run lint` passes and `tests/style-contract.test.mjs` still passes.
- [x] 6.2 Give the disclosure and file rows accessible names, keyboard-reachable disclosure toggles, and discoverable action labels; verify the DOM helper asserts roles and labels.

## 7. Documentation and runtime verification

- [x] 7.1 Document the review in `README.md` and add a `CHANGELOG.md` entry; verify the text matches the implemented behavior and commands.
- [x] 7.2 Record manual acceptance in `docs/runtime-compatibility.md` for create/edit/delete/rename, shell writes, outside-vault files, binary/large/`more` patches, a denied permission, reconnect, and a reopened conversation against 2.2.2 and the newest 2.3.x; verify the recorded notes match the observed turn and session views.
- [x] 7.3 Run the full gate: `npm test`, `npm run build`, and `npm run lint` all pass; verify all three complete cleanly.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
