# Tasks

## 1. Session coordinator: open a child atomically

- [x] 1.1 Add `SessionCoordinator.openChild(id)` in `src/opencode/sessions.ts` that `session.get`s the child, rejects a missing session or a different directory with `SessionError`, fetches its messages, and only then assigns `this.snapshot` (selected = child). Verify with new `tests/sessions.test.mjs` cases: success selects the child with its messages; a not-found id and a foreign-directory id both reject and leave the prior snapshot unchanged.
- [x] 1.2 Ensure `openChild` routes through the existing `run`/`checkAlive` admission and connection signal exactly like `load`. Verify the aborted-signal and error-wrapping behavior in `tests/sessions.test.mjs`.

## 2. Transcript: the embed link and delegated-task label

- [x] 2.1 In `src/ui/conversation.ts`, read `metadata.childID` as a non-empty string or absent in `subagentResult` (mirroring the existing `metadataText` handling). Verify `tests/conversation.test.mjs`: a marked record with `childID` exposes it, a marked record without it exposes none, and a record with only `metadata.source` absent is still not a subagent result.
- [x] 2.2 Add `openSubagent?(childID: string): void` to `ConversationOptions`, and in `updateEmbed` append an `<a class="markdown-embed-link" role="button" tabindex="0">` anchor (the host's `maximize-2` icon, `aria-label` and tooltip **Open subagent session**) when `childID` is present, activating on click, Enter, and Space. Verify `tests/conversation.test.mjs`: the anchor appears only with a child id, carries the label, and activation invokes the callback with the id.
- [x] 2.3 Add a prompt-label option (default **You**) to `ConversationOptions` and use it in `entryLabel`, `renderPrompt`, and `promptEntry` in place of the hard-coded **You**. Verify `tests/conversation.test.mjs`: the default stays **You**, and a supplied **Delegated task** label appears in the callout title and accessible name.

## 3. Read-only surface

- [x] 3.1 Add a read-only mode to `src/ui/chat-composer.ts` (`ChatComposer`): hide the textarea, the whole toolbar (model/variant/agent choices, send/stop, status, and retry), and the prompt actions, and render one muted hint naming the parent conversation centered horizontally and vertically in the card. Verify a composer/renderer test that the composer is empty except the centered hint when read-only, and the full composer returns otherwise.
- [x] 3.2 In `src/ui/chat-renderer.ts`, derive read-only from `state.snapshot?.selected?.parentID`, pass the **Delegated task** label into the `ConversationRenderer`, drive the composer read-only hint, and gate the Mod+Enter send scope on read-only. Verify a view/renderer test that a child snapshot renders read-only with the delegated-task label while a top-level snapshot renders normally.

## 4. View wiring and chrome

- [x] 4.1 Add `ChatView.openSubagent(childID)`: run the shared `discardDraftIfConfirmed`, then `sessions.openChild(childID)` → `synchronization.open()`, showing a Notice and re-rendering the unchanged parent on `SessionError`. Verify the draft-confirm path and the failure-keeps-parent behavior in a new view test.
- [x] 4.2 Record the `{ id, title }` of the session being left when entering a child and clear it on any draft or conversation switch; in `syncBreadcrumbs` (called from `refresh`) append a **opencode / sessions / parent title** crumb whose action returns via `selectConversation(parent.id)`. Verify a view/session-switcher test that the crumb appears only in a child and returning reselects the parent.
- [x] 4.3 Gate rename (header title edit and the **Rename conversation…** menu item) and `send` on read-only so a child session cannot be renamed or written to. Verify the header is not editable and the menu item is disabled in a child, and enabled in a top-level conversation.

## 5. Style, checks, and evidence

- [x] 5.1 Add only the hint, read-only centering, and composer/transcript width-alignment rules to `styles.css`; add no `.markdown-embed-link`, `--embed-*`, or host frame/padding declarations. Verify `tests/style-contract.test.mjs` (extended for the hint, centering, reserved gutter, and reading-font measure) passes and the diff copies no host embed rule.
- [x] 5.2 Run `npm test`, `npm run build`, and `npm run lint`; fix failures so all three pass. Then record a live acceptance run in the disposable vault (open a report embed, open its child read-only, return via the parent crumb, and confirm the switcher marks no row) in `docs/runtime-compatibility.md` and add a `CHANGELOG.md` bullet.

## Workflow follow-up

- Archive `subagent-session-link` after review, syncing the `native-chat` and `session-management` deltas into the main specs.

## Documentation and traceability

- [x] Documentation gate: the **Unreleased** `CHANGELOG.md` bullet records the user-visible outcome, `README.md` documents the report link and the read-only child, and `docs/runtime-compatibility.md` records the live acceptance and measurements.
- [x] `adr.md`/`adr/` check: this repository keeps no `adr.md` manifest and no `adr/` directory, so there are no durable ADR files to place. The decisions remain in `design.md`.
- [x] Traceability check: no separate TRACEABILITY manifest exists; the project's traceability row is the metrics table in `docs/runtime-compatibility.md`, updated with `openspec/changes/archive/2026-11-25-subagent-session-link`.
