# Tasks

## 1. Composer trigger and picker

- [x] 1.1 Add `$` mention helpers to `src/ui/composer-link.ts`: detect an eligible trigger at the caret, expose the query, extract known mention names from text, and build the `$name ` insertion edit. Cover start-of-input, whitespace boundary, mid-word rejection, whitespace/newline query rejection, and trailing-text preservation in `tests/composer-link.test.mjs`; verify with `node --test tests/composer-link.test.mjs`.
- [x] 1.2 Replace the note-only suggestion controller with a composer suggestion controller that detects `[[` first and `$` second, keeps one popover and one Mod+Enter send scope, ranks skills with Obsidian fuzzy search, renders skill name and description, and inserts the selected mention. Update `src/ui/chat-renderer.ts` and its accessors. Keep the existing note-linking tests passing and add skill tests for trigger, filtering, rendering, insertion, arrow/Enter/Tab selection, Escape/blur dismissal, and send-while-open; verify with `node --test tests/note-link-suggest.test.mjs` (or the renamed suggestion test file).
- [x] 1.3 Add skill suggestion row and description styles to `styles.css` using theme variables, and extend the suggestion DOM test to assert the new classes and text; verify with `npm test`.
- [x] 1.4 Document the `$` completion behavior in `README.md` beside the existing `[[` note-linking bullet; verify the described keys and insertion text match the implemented behavior.

## 2. Skill catalog loading

- [x] 2.1 Add `validateSkillList` for `{ location, data }` with required `id`, `name`, `path`, and `content` strings and an optional `description`, and wrap `client.skill.list` with it in `src/opencode/api-contract.ts`. Extend `tests/api-contract.test.mjs` for valid, malformed, and extra-field payloads; verify with `node --test tests/api-contract.test.mjs`.
- [x] 2.2 Add `skills?: readonly SkillInfo[]` to `SynchronizationState` and a `loadSkills()` action that shares one in-flight request, publishes the first successful catalog, and publishes an empty catalog on failure without calling `rejectIncompatible` or surfacing an options error. Extend `tests/synchronization-actions.test.mjs` for success, caching, duplicate concurrent calls, and failure; verify with `node --test tests/synchronization-actions.test.mjs`.
- [x] 2.3 Wire the suggestion controller's loader to `loadSkills()` and its catalog reader to state, requesting nothing during the initial connection and only once after the first `$`. Extend `tests/synchronization.test.mjs` or the renderer tests to assert no `skill.list` call before `$` and one call after; verify with the targeted test command.
- [x] 2.4 Update test fixtures whose fake clients are used with the suggestion loader to provide `skill.list`, keeping existing synchronization tests passing; verify with `node --test tests/synchronization.test.mjs`.

## 3. Prompt skill attachments

- [x] 3.1 Extend `PromptCoordinator` and `PendingPrompt` with resolved skill IDs so `send(text, skillIDs)` transmits `skills: [{ id }]` and `retry()` reuses the same IDs and prompt identity. Extend `tests/prompt.test.mjs` for attached sends, retries, and prompts without skills; verify with `node --test tests/prompt.test.mjs`.
- [x] 3.2 Resolve mentions in `SynchronizationActions.sendMessage`: ensure the catalog is loaded, match `$name` tokens exactly against loaded names, map to unique skill IDs, and pass them to the prompt coordinator while leaving unknown names as text. Add tests for selected and manually typed mentions, duplicates, unknown names, and an unavailable catalog in `tests/synchronization-actions.test.mjs`; verify with `node --test tests/synchronization-actions.test.mjs`.
- [x] 3.3 Add an end-to-end prompt assertion in `tests/synchronization.test.mjs` that a sent message with a known mention carries the matching skill ID with unchanged text, and that an unconfirmed retry carries the same IDs; verify with `node --test tests/synchronization.test.mjs`.
- [x] 3.4 Add the feature entry to `CHANGELOG.md`; verify it describes `$` completion and structured skill attachment without claiming a toolbar control or transcript display.

## 4. Integration checks

- [x] 4.1 Run `npm run build` and confirm TypeScript and the production bundle succeed.
- [x] 4.2 Run `npm run lint` and confirm no new lint findings.
- [x] 4.3 Run `npm test` and confirm the full suite passes.
- [x] 4.4 Manually smoke-test in Obsidian: type `$`, filter and select a skill, send, confirm the `$name` text remains and the request carries a skill attachment; then check `[[` note completion and Mod+Enter sending still work.

## Workflow follow-up

- [x] Documentation gate: README documents `$` completion and the CHANGELOG Unreleased bullet records the user-visible outcome; `docs/runtime-compatibility.md` records the live smoke test and delivery metrics.
- [x] `adr.md`/`adr/` check: this repository keeps no `adr.md` manifest and no `adr/` directory, so there are no durable ADR files to place. The decisions remain in `design.md`.
- [x] Traceability check: no separate TRACEABILITY manifest exists; the project's traceability row is the metrics table in `docs/runtime-compatibility.md`, updated with the archive folder after the move.
- [x] Archive the change after review and acceptance.
