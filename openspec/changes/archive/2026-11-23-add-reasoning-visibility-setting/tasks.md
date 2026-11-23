# Tasks

## 1. Setting and persistence

- [x] 1.1 In `src/settings.ts`, add `showReasoning: boolean` to `OpenCodeSettings` and resolve it in `loadSettings` as `record.showReasoning === true`, so a missing key or any non-boolean value reads as off. Add a **Show reasoning** toggle to the settings tab with a description that says reasoning is hidden by default, and leave the other rows unchanged. Verify with a new `tests/settings.test.mjs` that bundles `src/settings.ts` and asserts: missing key → `false`, literal `true` → `true`, `false`/strings/numbers → `false`, and existing `executablePath`, `autoStart`, `selectedSession`, and `managedOrphan` parsing still works.
- [x] 1.2 In the same settings test, render the tab with a minimal chainable `Setting` stub and assert the **Show reasoning** row starts unchecked, updates `settings.showReasoning`, and calls the save callback. Verify the test passes under `npm test`.

## 2. Transcript rendering

- [x] 2.1 Add `showReasoning?: () => boolean` to `ConversationOptions` in `src/ui/conversation.ts` and skip `reasoning` content parts before `keys.add` and part creation when the getter is absent or returns false, so hidden reasoning contributes no summary, icon, preview, or body while answer text and tool parts render unchanged. Verify in `tests/conversation.test.mjs` that a message with reasoning and text shows no `.opencode-reasoning` element by default and still shows the answer text.
- [x] 2.2 Extend the conversation test for the enabled path and live toggling: with `showReasoning: () => true` the existing reasoning markup and preview appear; flipping a shared flag to false on the next render removes the reasoning part, disposes its Markdown, and keeps text and tool parts; flipping back to true recreates the disclosure with the accumulated reasoning text. Verify the assertions run under `npm test` without weakening the existing fold, preview, and footnote tests.
- [x] 2.3 Thread the live getter from `main.ts` through `ChatView` and `ChatRenderer` into `ConversationOptions`, reading the current settings value on every render instead of copying it at construction. Verify `npm run build` type-checks and the existing `tests/conversation.test.mjs`, `tests/interactions.test.mjs`, and `tests/plugin-shell.test.mjs` still pass.

## 3. Live setting updates

- [x] 3.1 Give `OpenCodeSettingTab` an optional change callback that runs after the toggle mutates the settings object and `save()` resolves, and have `main.ts` use it to call a public `ChatView.refreshFromSettings()` on every open `opencode-chat` leaf; that method re-renders from the current synchronization state without network I/O. Verify in the disposable vault that toggling **Show reasoning** while chat is open adds or removes reasoning rows immediately, without reopening the view or reloading the plugin, and that scroll position and other expanded disclosures are preserved.
- [x] 3.2 Verify the toggle is harmless with no conversation loaded, before connection, and with another view focused, and that reopening chat or selecting another conversation follows the stored value. Confirm `npm test` and `npm run build` still pass after the wiring.

## 4. Documentation

- [x] 4.1 Update `README.md` to document **Settings → OpenCode → Show reasoning**, state that it is off by default and what it controls, and revise the transcript bullet so reasoning is described as opt-in while tool activity stays folded by default. Verify every described behavior matches the implemented rows and that no internal class or function name appears.
- [x] 4.2 Update the stored-data lists in `README.md`, `docs/architecture.md` (**Persistence**), and `AGENTS.md` (hard invariants) to include the reasoning-display preference, keeping the statement that transcripts, drafts, and credentials are never stored. Verify all three lists agree and no new sensitive data is claimed or omitted.
- [x] 4.3 Add an Unreleased `CHANGELOG.md` entry stating that reasoning is hidden by default and can be enabled with the **Show reasoning** setting. Verify it names the user-visible outcome without claiming a protocol or service change.

## 5. Integration verification

- [x] 5.1 Run `npm test`, `npm run build`, and `npm run lint` and verify all three succeed.
- [x] 5.2 Inspect `git diff --stat` and `git diff` for the touched files and verify there is no protocol, credential, manifest, dependency, generated-artifact, or unrelated change beyond the added persisted boolean.
- [x] 5.3 Reload the disposable vault with the final build and verify acceptance end to end: a restored conversation with reasoning shows no reasoning row while the setting is off, enabling it shows folded rows with a one-line preview that expands to Markdown, disabling it removes them at once while answers and tool rows stay, and light/dark themes plus a narrow sidebar are unaffected. Record any accepted deviation in `docs/runtime-compatibility.md`.

## Workflow follow-up

- Archive the change after review and acceptance.
- Verify the archived `native-chat` delta and the updated `openspec/specs/native-chat/spec.md` preserve the default-off behavior.
