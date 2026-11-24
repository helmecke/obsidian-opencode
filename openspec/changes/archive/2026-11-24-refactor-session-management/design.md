# Design

## Context

See `proposal.md` for motivation. Today `main.ts` builds one shared `SessionCoordinator` and one `SynchronizationCoordinator` for every chat leaf, the selected session is persisted in plugin settings (`selectedSession`), and `ChatRenderer.build()` places the conversation `<select>` and a new-conversation icon inside the composer's toolbar. `openChat` reveals the first existing chat leaf or creates one. `session.update` exists in the bundled `@opencode/client` 2.2.2 but is not wrapped by `withApiValidation`, and `session.renamed` passes `validateEvent` but is unsupported by `SessionReducer`, so a rename today would trigger a resync.

## Goals / Non-Goals

**Goals:**

- Keep the existing global, single-session model and the shared synchronization/ingestion path intact; change only how the selected session is chosen and surfaced.
- Make the session name a first-class part of the view chrome with an inline rename affordance.
- Move switching/creation/rename into the document menu with a fuzzy session picker.

**Non-Goals:**

- Per-tab sessions (the user chose global scope).
- Deleting, archiving, or searching sessions across directories.
- A keyboard shortcut or command for the session switcher beyond the menu item.
- Eager creation of an empty server session when chat opens.

## Decisions

**1. Keep global session identity; "open = new" is the only trigger change.**
`openChat` keeps revealing the existing chat leaf when one is present. When no
chat leaf exists, a new leaf is created and its first open starts a local draft.
Sending the first message creates the server session. Every chat view continues
to share one `SessionCoordinator`/`SynchronizationCoordinator`, so all views stay
in sync without per-view event fan-out.

- Why: the user explicitly chose global scope; this avoids the much larger per-view ingestion/synchronization refactor.
- Alternative considered: per-tab sessions with per-view coordinators. Rejected.

**2. Keep the first conversation client-side until its first turn.**
Opening chat or choosing **New conversation** starts a local draft: no OpenCode
session is created. The draft carries the vault directory, an optional local
title, and the agent/model choices shown in the composer. The agent starts at
`config.default_agent`, then `build`, then the first primary agent. The model
starts at the agent's own model, then the configured `model`, then the last
model the user selected, then `model.default`, then the first enabled catalog
model. The selections remain editable. Sending the first message materializes
the draft through `SessionCoordinator.create()`'s deduplicated admission,
applies the local title and selections, synchronizes, and then sends the prompt.

- Why: matches OpenChamber's `newSessionDraft` flow and avoids empty server
  sessions every time chat opens.
- Alternative considered: eager creation on open. Rejected because it leaves
  empty sessions and makes an untouched tab a server-side conversation.
- Alternative considered: lazy creation inside the prompt call. Rejected because
  a prompt requires a `sessionID`; creation must happen first.

**3. Drop `selectedSession` persistence; the snapshot is the source of truth.**
Remove `selectedSession` from `OpenCodeSettings` and its validation.
`SessionCoordinator.selectedID` and `open()` read the selected session from the
in-memory snapshot instead of settings, and nothing writes the selection back.
A snapshot without a selection and without an `unavailable` empty state is a
local draft; reconnecting preserves it and never creates a session. Opening never
auto-resumes; resume happens through the switcher.

- Why: "open = new, resume = switcher" is the requirement; a persisted last-session would contradict it.
- Alternative considered: keep the setting for restart-resume while user-open starts new. Rejected to avoid two divergent open paths.

**4. Add `SessionCoordinator.rename(title)` behind `withApiValidation`.**
Rename calls `client.session.update({ sessionID, title })`, wrapped in `api-contract.ts` with `request(..., true)`. A missing session keeps `SessionNotFoundError` and other incompatible statuses map to the fixed API-compatibility error. A 400/422 response stays an ordinary rename failure: the view shows a notice and keeps the previous title. After a successful rename the coordinator re-reads the session (`refreshSelected`) so the displayed title is server-confirmed. Empty/whitespace-only titles are rejected locally.

- Why: the server owns the title; a failed rename must never look like it succeeded.
- Alternative considered: optimistic local patch without re-reading. Rejected because a rejected rename must revert exactly.

**5. Treat `session.renamed` as a metadata update, not a transcript mutation.**
Intercept `session.renamed` for the selected session in `SynchronizationCoordinator.applyInteraction` before it reaches `EventIngestion`: patch the snapshot's `selected.title` and republish, without touching the reducer. `session.deleted` marks the snapshot unavailable. This prevents the current behavior where an unsupported mutation invalidates the projection and forces a resync.

- Why: a title change by another client should update the chrome live, not reload the transcript.
- Alternative considered: adding a `session.renamed` case to `SessionReducer`. Rejected; the reducer models message content, not session metadata.

**6. Build the chrome from Obsidian's native title and breadcrumb elements.**
`ChatView.getDisplayText()` returns the selected session or draft title, falling
back to **New conversation** when untitled. Because Obsidian has no public API to
refresh a view title after open, `ChatView` feature-detects
`.view-header-title` and the tab title element and writes the text directly. The
same `.view-header-title` is the `contenteditable` rename surface, and
`.view-header-title-parent` is populated with native `view-header-breadcrumb`
spans and separators: **opencode / sessions / title**. **opencode** starts a new
draft, **sessions** opens the switcher, and the title renames. While editing, the
parent breadcrumbs collapse with Obsidian's 150 ms opacity/width transition and
return on blur. Renaming remains available through the document menu when the
nodes are absent, so the header hook is a progressive enhancement, not the only
path.

- Why: the user asked for the name next to the navigation arrows to show the session name and rename on click; Obsidian renders the title there only through `getDisplayText`, which has no public refresh trigger.
- Alternative considered: an inline title at the top of the chat body (like a note's inline title). Rejected; it would not put the name next to the navigation as requested, though it is the fallback if the chrome hook proves too fragile.

**7. Session switcher is a `FuzzySuggestModal<SessionInfo>`.**
**Switch conversation…** opens a fuzzy suggestion modal whose `getItems()` fetches the current vault's sessions fresh on open, `getItemText()` returns the title (or a stable placeholder for untitled), rows show the title plus a relative update time, and the current session is marked. `onChooseItem` selects the session and reloads it; Escape leaves the selection unchanged.

- Why: `FuzzySuggestModal` is the same public surface Obsidian uses for its file quick switcher, giving matching, keyboard navigation, and theming for free.
- Alternative considered: a custom `SuggestModal`/`Modal`. Rejected as more code with no behavioral gain.

**8. Menu wiring and composer cleanup.**
`ChatView.onPaneMenu` adds **Switch conversation…**, **New conversation**, and **Rename conversation…** for both the `more-options` and `tab-header` sources. `ChatRenderer` removes the conversation `<select>` and new-conversation icon; status and **Retry discovery** stay in the composer.

- Why: the document options menu is where Obsidian users look for per-document actions, and the composer keeps only message/status concerns.
- Alternative considered: keep the new-conversation icon in the composer. Rejected to give the composer a single, message-focused role.

**9. Confirm before discarding unsent composer text on switch.**
When a switch would drop unsent composer text, the view asks for confirmation
first. Closing the view never interrupts execution (existing behavior is
preserved), and switching never stops the previous session's execution.

## Risks / Trade-offs

- **Internal chrome classes for the title hook** → feature-detect the header/tab title nodes at open and degrade to `getDisplayText()` plus menu rename when absent; do not hard-fail the view.
- **First send fails after creating the session** → the session exists but stays empty; the draft text remains available and the user can retry. Accepted rather than deleting a server-owned session automatically.
- **`session.renamed` resync if interception is missed** → handle it in `applyInteraction` before ingestion, and keep a regression test that a rename does not rebuild the transcript.
- **Multiple restored leaves racing to materialize** → reuse `SessionCoordinator.create()`'s shared `creating` promise so concurrent first turns admit exactly one session, and keep the draft client-only until then.
- **`getDisplayText` is only read at open** → live title changes rely on the header hook; the switcher list and inline rename are the authoritative fallbacks.

## Migration Plan

- Remove `selectedSession` from settings; `loadSettings` silently ignores legacy values, so no selected-session migration is needed.
- Persist the last selected model and variant, validated like the other stored fields. A draft's title, agent, model, variant, and transcript stay in memory until the first message creates the session.
- Update `README.md` (conversations and privacy), `docs/architecture.md` (persistence, chrome, draft defaults), and `docs/client-contract-review.md` (note `session.create` on first send, `session.update`, and `session.renamed` handling).
- Ship in the next plugin version. Rollback is a code revert; the added `lastModel` preference is ignored by older versions, and no protocol or transcript data changes.
