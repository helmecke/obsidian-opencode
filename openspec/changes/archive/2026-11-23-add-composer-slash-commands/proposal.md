# Proposal

## Why

The composer can complete vault notes with `[[` and OpenCode skills with `$`, but OpenCode's slash commands can only be typed from memory. A user who types `/` sees no list, and simply sending `/name` as prose does not run the command: OpenCode's prompt endpoint treats text as plain prose, so a client must match a leading `/name` against the registered commands and call `session.command` instead. OpenCode and OpenChamber both provide this discovery and dispatch; the plugin should match that behavior.

## What Changes

- Typing `/` at the start of the chat message opens an inline, keyboard-navigable list of the OpenCode commands registered for the vault.
- The list is filtered and ranked by command name as the user types; each row shows the command as invoked (`/name`) and its description when one is available. Nested command names such as `/team/review` are supported.
- Selecting a command replaces the typed query with `/name ` and leaves the caret after the inserted space. Text after the caret is preserved, and the message is not sent.
- Sending a message whose first token is a known `/name` runs that command through `session.command` with the remaining text as its arguments. Unknown `/name` text is still sent as an ordinary prompt, so slash-leading prose keeps working.
- A failed command send keeps the composer text, reports the failure in the composer card, and is never automatically resent. Skill mentions in command arguments attach the same way they do for ordinary messages.
- Command loading is lazy and non-fatal: the first `/` trigger loads the vault's command catalog, a failure does not block composing or sending, and an unavailable catalog leaves `/name` as ordinary prompt text.

Out of scope: creating, editing, enabling, or disabling commands; a composer toolbar command button; rendering command results differently from ordinary prompts; argument or placeholder completion; and refreshing the catalog on `command.updated` events during a connection.

## Capabilities

### New Capabilities

- `composer-slash-commands`: Triggering, filtering, selecting, and executing OpenCode slash commands from the chat composer.

### Modified Capabilities

None. Existing note-linking, skill-mention, and native-chat requirements remain unchanged.

## Impact

- `src/ui/composer-link.ts` for slash-query detection and insertion edits, and `src/ui/composer-suggest.ts` for the third completion trigger and command rows.
- `src/ui/chat-renderer.ts` and `src/ui/chat-view.ts` for catalog wiring, command dispatch feedback, and composer clearing only after a confirmed send.
- `src/opencode/catalog-shapes.ts`, `src/opencode/api-shapes.ts`, and `src/opencode/api-contract.ts` for `command.list` validation.
- `src/state/synchronization.ts`, `src/state/synchronization-actions.ts`, and `src/state/synchronization-model.ts` for the lazy command catalog and the command send path; `src/state/prompt-coordinator.ts` if the command path needs the prompt admission gate.
- `styles.css` for command suggestion rows, `README.md`, `CHANGELOG.md`, and `docs/runtime-compatibility.md` for documentation and the manual smoke test.
- Unit and DOM tests under `tests/` for trigger detection, ranking, insertion, catalog loading, dispatch, fallback, and failure handling.
