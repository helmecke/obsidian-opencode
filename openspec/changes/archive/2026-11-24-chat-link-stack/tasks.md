# Tasks

## 1. Modifier-aware router

- [x] 1.1 Change `attachLinkRouter` so the click handler derives the destination from the event with `Keymap.isModEvent(event)` and forwards it to `LinkEnvironment.open`, instead of always opening with `newLeaf = true`; update `tests/markdown.test.mjs` to assert the pane type reaches `open`. Verify `npm test` and `npm run build` pass.
- [x] 1.2 Keep the unresolved/contextless guard intact and add an assertion that an unresolved click neither calls `open` nor creates a group. Verify `npm test` passes.

## 2. Sticky note group

- [x] 2.1 Add `src/ui/link-stack.ts` with create-to-the-right (`createLeafBySplit(chatLeaf, 'vertical')`), append (`createLeafInParent`), dedupe-by-file with subpath apply, close-detection, and the guarded `vault.getConfig('focusNewTab')` focus rule with a focus fallback. Verify `npm run build` passes.
- [x] 2.2 Add `tests/link-stack.test.mjs` (esbuild-compiled like the existing markdown test, mocking the workspace surface) covering first-use creation, later append, existing-note focus with heading/block subpath, recreate-after-close, per-tab scope, reserved note-tab selection, and the focus fallback. Verify `npm test` passes.

## 3. Wire into the chat view

- [x] 3.1 In `src/ui/chat-renderer.ts`, build the `LinkEnvironment` with the chat leaf and the `LinkStack`, and route opens by pane type: a plain click uses the reserved note-tab rule (`MarkdownView` leaf in the root split), while Cmd/Ctrl appends to the chat's own split. Initial routing verified `npm run build` and the updated router test; the live-review refinements are recorded in 5.1–5.3.
- [x] 3.2 In `src/ui/chat-view.ts`, own one `LinkStack` per view instance and pass the chat leaf into the renderer. Verify `npm run build` passes.

## 4. Documentation

- [x] 4.1 Add the modifier table and the one-time **Stack notes** tip to the README's link-navigation section. Verify the written instructions match the behaviour in the spec scenarios.
- [x] 4.2 Record the `vault.getConfig('focusNewTab')` dependency and its focus fallback as a limitation in `docs/runtime-compatibility.md`. Verify the entry states the fallback behaviour.

## 5. Post-verification reconciliation

- [x] 5.1 Plain click reuses an existing note tab, preferring one outside the chat's group and then one inside it, instead of opening a split when a note tab is available.
- [x] 5.2 Cmd/Ctrl and middle-click append the new tab to the chat's own split; a plain click with no reusable note tab does the same. Neither targets the last focused split or creates a new split group.
- [x] 5.3 Automated evidence: `tests/markdown.test.mjs` covers every pane type and the unresolved/contextless guards; `tests/link-stack.test.mjs` covers note-tab selection, group creation, append, dedupe with subpaths, recreation, per-tab scope, and the focus fallback. `npm test` passes 253 tests, `npm run build` and `npm run lint` pass, and `openspec validate --strict` is valid.

## 6. Documentation follow-up

- [x] 6.1 Correct the README link-navigation lead-in: it still says activation never adds a note to the chat's tab group, while the verified table uses that group for Cmd/Ctrl and for a plain click without a reusable note tab. Verify the sentence matches the table and the spec scenarios. `docs/runtime-compatibility.md` already matches the verified behaviour and needs no change.

## Workflow follow-up

- After implementation and review, archive the change and update the main `vault-link-navigation` spec.
- Record live Obsidian acceptance of each modifier row in `docs/runtime-compatibility.md`.
