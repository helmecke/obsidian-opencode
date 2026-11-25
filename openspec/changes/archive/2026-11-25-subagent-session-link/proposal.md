# Proposal

## Why

A delegated subagent's report is already readable as an attributed Markdown embed in its parent transcript, but the subagent's own session — the tool calls, reasoning, and reads that produced that report — is hidden: the switcher deliberately excludes child sessions, so there is no way to open one from Obsidian. The report record already carries the child session id in `metadata.childID`, so the missing piece is an affordance, not new data.

## What Changes

- The subagent report embed gains Obsidian's native `.markdown-embed-link` anchor in its top-right corner when the record carries a non-empty `metadata.childID`. The plugin reuses the host class and its theme rules unchanged and adds only the click behavior.
- Activating the link opens the child session read-only in the same chat view: the transcript reuses the conversation renderer, the composer's input, send, stop, and agent/model selectors are replaced by one muted hint naming the parent conversation, and the header title is not editable.
- The child's user records read **Delegated task** instead of **You**, so the delegated instruction is not attributed to the reader.
- The header breadcrumbs append the parent conversation's title while a child is open; activating it returns to the parent and reloads its messages, exactly like the switcher.
- The switcher still lists top-level conversations only; while a child is open, no row is marked **Current**.
- A report with an absent child id renders no link; a present but unresolvable id shows a notice and leaves the parent conversation unchanged, never replaced by an empty state.
- Switching to a child with unsent composer text asks the same **Discard unsent message?** confirmation as the switcher.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: the subagent result embed gains a link to its child session, and a child session renders read-only with delegated-task attribution.
- `session-management`: a subagent child session becomes openable from its report embed (read-only, unlisted), the header breadcrumb gains a parent-return entry, the switcher marks no row while a child is open, and compose/rename are withheld in a child.

## Impact

- `src/ui/conversation.ts`: render the `.markdown-embed-link` anchor on the subagent embed and route its activation.
- `src/ui/chat-view.ts`: open-by-id action, read-only mode, and the parent breadcrumb.
- `src/ui/chat-renderer.ts`: read-only composer surface and delegated-task label.
- `src/opencode/sessions.ts`: resolve/verify a child by id before switching so an unresolvable id cannot replace the current view.
- `styles.css`: at most the hint line; the link inherits host `.markdown-embed-link` rules.
- Tests: `tests/conversation.test.mjs`, `tests/sessions.test.mjs`, `tests/session-switcher.test.mjs`, plus view/renderer coverage for read-only mode.
- `CHANGELOG.md` and `docs/runtime-compatibility.md` (live verification).
- No API, dependency, persisted-setting, or privacy change: `metadata.childID` and `parentID` are already returned and validated; the child selection is in-memory only.
