# Tasks

## 1. Session coordinator: drop persistence, add rename

- [x] 1.1 Remove `selectedSession` from `OpenCodeSettings`, its `loadSettings` validation, and every read/write in `SessionCoordinator` (`selectedID`, `open`, `create`, `unavailable`, `load`); make the in-memory snapshot the source of the selected session. Verify `node --test tests/settings.test.mjs tests/sessions.test.mjs` passes.
- [x] 1.2 Add `SessionCoordinator.rename(title)` that rejects blank/whitespace titles, calls `client.session.update({ sessionID, title })`, then re-reads via `refreshSelected()` so the displayed title is server-confirmed. Verify a new rename test in `tests/sessions.test.mjs` covers blank rejection, success, and failure surfacing.

## 2. API contract for rename

- [x] 2.1 Wrap `session.update` in `withApiValidation` using `request(..., true)` so a 404/422 maps to the fixed compatibility or missing-session error instead of a raw response. Verify `node --test tests/api-contract.test.mjs` passes, including a new assertion that an incompatible status is translated.

## 3. Draft open and session metadata events

- [x] 3.1 Route the view's initial open through a client-side new-conversation draft that creates no server session, materialize that draft through `SessionCoordinator.create()` on the first message, and keep reconnect/retry reloading the snapshot's selected session or draft without creating. Verify `node --test tests/synchronization.test.mjs` passes and `tests/plugin-shell.test.mjs` shows a draft after first open and one session after the first send.
- [x] 3.2 Intercept `session.renamed` (patch `selected.title` and republish) and `session.deleted` (mark unavailable) in `SynchronizationCoordinator.applyInteraction` before ingestion, so the reducer never sees an unsupported mutation. Verify `node --test tests/event-ingestion.test.mjs tests/synchronization.test.mjs` passes, including a regression test that a rename does not rebuild the transcript.
- [x] 3.3 Resolve draft agent/model/thinking defaults from the configured default agent and model, the agent's own model, the last selected model and variant, then the server or first enabled model; persist the last selected model in settings and apply the draft selections when the first message creates the session. Verify `node --test tests/settings.test.mjs tests/synchronization.test.mjs tests/plugin-shell.test.mjs` passes.

## 4. View chrome: title, inline rename, and document menu

- [x] 4.1 Make `ChatView.getDisplayText()` return the session or draft title with a **New conversation** fallback, expose the native `.view-header-title` as a contenteditable inline editor, and sync the header/tab text nodes through a feature-detected hook (Enter/blur commit, Escape cancel, empty rejected, failure notice). Verify `node --test tests/plugin-shell.test.mjs` and a new chat-view title test pass.
- [x] 4.2 Add `ChatView.onPaneMenu` items **Switch conversation…**, **New conversation**, and **Rename conversation…** for both `more-options` and `tab-header` sources. Verify a new menu test asserts the three items appear for both sources and invoke the expected handlers.
- [x] 4.3 Populate the native `.view-header-title-parent` breadcrumbs as **opencode / sessions / title**, wire **opencode** to start a new draft and **sessions** to the switcher, and collapse/restore the parent while editing with Obsidian's 150 ms transition. Verify `tests/plugin-shell.test.mjs` covers the navigation actions and collapse behavior.

## 5. Session switcher modal

- [x] 5.1 Implement a `FuzzySuggestModal<SessionInfo>` switcher that fetches the current vault's sessions fresh on open, shows title plus relative update time, marks the current session, and selects on choose. Verify a new switcher test (jsdom) covers ordering, current marker, and that selecting invokes `SessionCoordinator.select`.

## 6. Composer cleanup and draft confirmation

- [x] 6.1 Remove the conversation `<select>` and new-conversation icon from `ChatRenderer`/`ChatComposer`, delete their accessors and CSS, and leave status and **Retry discovery** in the composer. Verify `node --test tests/plugin-shell.test.mjs tests/conversation.test.mjs` passes with updated assertions.
- [x] 6.2 Add a confirmation before a switch discards unsent composer text, and keep switching from interrupting the previous session's execution. Verify a new interaction test covers the confirm path and that a switch while executing does not stop the prior session.

## 7. Documentation

- [x] 7.1 Update `README.md` (Conversations and privacy), `docs/architecture.md` (persistence, chrome, draft defaults), and `docs/client-contract-review.md` (`session.create` on first send, `session.update`, and `session.renamed` handling) to match the new model. Verify `npm run lint` passes and the documented commands/behaviors read consistently.

## 8. Integration checks

- [x] 8.1 Run `npm test`, `npm run build`, and `npm run lint`; fix any failures and verify all three are clean.
- [x] 8.2 Perform manual acceptance in a disposable vault (open chat shows a **New conversation** draft; the first send creates the session; the header, tab, and `opencode / sessions / title` breadcrumbs show and rename the title; the document menu switches, creates, and renames; switching during execution keeps the server running) and append new evidence to `docs/runtime-compatibility.md`.

## Workflow follow-up

- [x] Documentation gate: `README.md`, `CHANGELOG.md`, `docs/architecture.md`, and `docs/client-contract-review.md` reflect the delivered draft, breadcrumb, rename, and default-selection behavior; `docs/runtime-compatibility.md` records the live acceptance.
- [x] `adr.md`/`adr/` check: this repository keeps no `adr.md` manifest and no `adr/` directory, so there are no durable ADR files to place. The decisions remain in `design.md`.
- [x] Traceability check: no separate TRACEABILITY manifest exists; the project's traceability row is the metrics table in `docs/runtime-compatibility.md`, updated with `openspec/changes/archive/2026-11-24-refactor-session-management`.
- [x] Archive the change after the project's review and acceptance requirements are satisfied.
- [x] Verify the archived result and that the `native-chat` and `session-management` main specs reflect the delta.
