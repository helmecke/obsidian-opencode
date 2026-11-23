# Tasks

## 1. Composer trigger and command rows

- [x] 1.1 Add `commandQueryAt` and `commandInsertEdit` to `src/ui/composer-link.ts`: require `/` at message index 0, allow nested names with `/`, reject a caret outside the first token, and build the `/name ` insertion while preserving text after the caret. Cover start, partial, nested, argument-caret, mid-message, preservation, and no-trigger cases in `tests/composer-link.test.mjs`; verify with `node --test tests/composer-link.test.mjs`.
- [x] 1.2 Add a `command` suggestion kind to `src/ui/composer-suggest.ts` and check it after the note trigger and before the skill trigger; render `/name` with its optional description, rank by fuzzy name match, list all commands in name order for an empty query, and insert without sending. Extend `tests/composer-suggest.test.mjs` for every trigger boundary, filtering, no match, row content, insertion, preserved trailing text, Escape/blur dismissal, and Mod+Enter send-while-open; verify with `node --test tests/composer-suggest.test.mjs`.
- [x] 1.3 Widen the suggestion catalog interface to separate skill and command loaders/getters and update the `src/ui/chat-renderer.ts` wiring so a command query loads only the command catalog; verify the existing note and skill suggestion tests still pass with `node --test tests/composer-suggest.test.mjs`.
- [x] 1.4 Add command suggestion row selectors to `styles.css` beside the shared suggestion layout using theme variables, and assert the classes and description rendering in the suggestion DOM tests; verify with `npm test`.
- [x] 1.5 Document `/` completion and command execution in `README.md` beside the note-linking and skill-mention bullets, including nested names, arguments, unknown-command fallback, and keyboard behavior; verify every described key and insertion matches the implemented behavior.

## 2. Command catalog

- [x] 2.1 Add `validateCommandList` for `{ location, data }` with a required non-empty `name` and optional `description`, export it through `src/opencode/api-shapes.ts`, and wrap `client.command.list` in `src/opencode/api-contract.ts`. Extend `tests/api-contract.test.mjs` for valid, malformed, and extra-field payloads; verify with `node --test tests/api-contract.test.mjs`.
- [x] 2.2 Add `commands?: readonly CommandInfo[]` to `SynchronizationState` and a `loadCommands()` action that shares one in-flight request, publishes the first successful catalog, caches it for the connection, and publishes an empty catalog on failure without an options error. Extend `tests/synchronization-actions.test.mjs` for success, caching, concurrent calls, failure, and no request during open; verify with `node --test tests/synchronization-actions.test.mjs`.
- [x] 2.3 Wire the composer's command loader to `loadCommands()` and its reader to state, and update fake clients in the affected fixtures with `command.list`; add a test that no command catalog request happens before `/` and one happens after the trigger, then verify with `node --test tests/synchronization.test.mjs` and `node --test tests/synchronization-actions.test.mjs`.

## 3. Command dispatch

- [x] 3.1 Add an idle gate to `PromptCoordinator` so the command path reuses the existing busy and uncertain messages without creating a prompt identity; cover the gate in `tests/prompt.test.mjs`; verify with `node --test tests/prompt.test.mjs`.
- [x] 3.2 Make `SynchronizationActions.sendMessage` detect a leading first token, load commands when needed, match an exact loaded name, resolve `$name` mentions in the arguments, call `session.command` with the argument text and optional skill IDs, refresh the selected snapshot on success, publish a fixed error on failure, and fall back to the prompt path for unknown or unavailable commands. Treat command-not-found and command-execution errors as ordinary command failures rather than API incompatibility. Extend `tests/synchronization-actions.test.mjs` for known, argument, nested, unknown, unavailable-catalog, rejection, command-not-found, unconfirmed-prompt, and skill-attachment cases; verify with `node --test tests/synchronization-actions.test.mjs`.
- [x] 3.3 Return confirmed delivery from the coordinator and make `src/ui/chat-view.ts` clear the composer only for a confirmed prompt or command, keeping a failed command's text in place. Add a view or plugin-shell assertion for confirming and failing sends; verify with `node --test tests/plugin-shell.test.mjs`.
- [x] 3.4 Add the command-specific action error to `src/state/synchronization-model.ts` and assert that a rejected command shows it in the composer card while the text remains; verify with `node --test tests/synchronization-actions.test.mjs` and `npm test`.
- [x] 3.5 Add an end-to-end synchronization assertion that a known leading command calls `session.command` with the expected arguments and no `session.prompt` call, and that an unknown leading command still uses the prompt path; verify with `node --test tests/synchronization.test.mjs`.
- [x] 3.6 Add the feature entry to `CHANGELOG.md`, describing `/` completion and command dispatch without claiming command management or argument completion.

## 4. Integration checks

- [x] 4.1 Run `npm run build` and confirm TypeScript and the production bundle succeed.
- [x] 4.2 Run `npm run lint` and confirm no new lint findings.
- [x] 4.3 Run `npm test` and confirm the full suite passes.
- [x] 4.4 Manually smoke-test in Obsidian: type `/`, filter and select a command (including a nested name), send it with arguments, confirm the command runs rather than the text appearing as a prompt, then check unknown `/name` fallback, a failed command keeping its text, and `[[`/`$` completion plus Ctrl/Cmd+Enter still working.
- [x] 4.5 Record the smoke test and test counts in `docs/runtime-compatibility.md`, including the command catalog and command dispatch in the supported API surface and the metrics table.

## Workflow follow-up

- [x] Documentation gate: README, CHANGELOG, and `docs/runtime-compatibility.md` reflect the delivered `/` behavior and verified smoke test.
- [x] `adr.md`/`adr/` check: this repository keeps no ADR manifest and no `adr/` directory, so there are no durable ADR files to place. The decisions remain in `design.md`.
- [x] Traceability check: no separate TRACEABILITY manifest exists; the project's traceability row is the metrics table in `docs/runtime-compatibility.md`, updated with `openspec/changes/archive/2026-11-23-add-composer-slash-commands`.
- [x] Archive the change after review and acceptance.
