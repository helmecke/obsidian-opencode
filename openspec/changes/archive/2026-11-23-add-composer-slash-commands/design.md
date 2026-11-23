# Design

## Context

See `proposal.md` for motivation and `specs/composer-slash-commands/spec.md` for the behavior contract.

The composer already has a single inline completion controller, `ComposerSuggest`, which handles `[[` note links and `$` skill mentions through one `AbstractInputSuggest` popover and one view-local Mod+Enter handler. `SynchronizationState` carries the lazily loaded `skills` catalog, and `SynchronizationActions.sendMessage` resolves `$name` mentions before `PromptCoordinator.send` transmits a prompt with skill IDs.

OpenCode distinguishes a prompt from a command. `client.session.prompt` admits prose and does not parse slash commands; OpenCode's own clients inspect the first token, match it against `command.list`, and call `client.session.command({ sessionID, name, text })` with the remaining text as arguments. The installed `@opencode/client` 2.2.2 exposes both `client.command.list({ location })` returning `{ location, data: CommandInfo[] }` (name and optional description) and `client.session.command(...)`, which returns no admission identity.

## Goals / Non-Goals

**Goals:**

- Add `/` completion to the existing composer popover without another controller or shortcut.
- Match OpenCode and OpenChamber dispatch: a leading known `/name` runs the command, with the rest of the message as arguments.
- Load commands lazily and keep a catalog failure from breaking chat.
- Clear the composer only after the service accepts a command, and keep the text on failure.

**Non-Goals:**

- No command creation, editing, enable/disable, or catalog browsing UI.
- No argument, placeholder, or file completion inside command arguments.
- No `command.updated` live refresh; the catalog lives for one connection like the skill catalog.
- No new composer toolbar control.
- No special transcript rendering for command results.

## Decisions

### Third trigger in the existing suggestion controller

Extend `ComposerSuggest` with a `command` suggestion kind. Trigger order stays note, then command, then skill: a note link can open inside a command argument, while command and skill triggers cannot overlap because a command trigger requires the message's first character.

The command trigger is stricter than the skill trigger: the message must start with `/` at index 0, and the caret must be inside the first whitespace-delimited token. This matches what OpenCode will actually execute (a leading token) and avoids opening a command list for `/` inside prose or paths. Nested command names such as `team/review` are valid, because the validation only rejects whitespace, not `/`.

A new helper pair in `composer-link.ts`, `commandQueryAt` and `commandInsertEdit`, returns the query and builds the `/name ` insertion from the leading `/` through the caret. The insertion mirrors `skillMentionEdit`: it preserves text after the caret, and the trailing space closes the trigger. Loading and filtering use the same Obsidian fuzzy search and result limit as skills.

Rows show the command as invoked (`/name`) plus the description when present. The command row reuses the existing suggestion row layout by adding command classes to the grouped style selectors rather than duplicating declarations.

### Lazy command catalog beside the skill catalog

Add `commands?: readonly CommandInfo[]` to synchronization state and `loadCommands()` to the coordinator and actions. It mirrors `loadSkills()`: one shared in-flight promise, the first successful result published, reuse for the connection, and an empty published catalog on failure without `rejectIncompatible` or an options error. A new `validateCommandList` checks `{ location, data }` with a non-empty `name` and optional `description`.

`ComposerSuggest` currently takes a `SkillCatalog` with `load` and `get`. Rename and widen it to a `ComposerCatalog` with `loadSkills`/`getSkills` and `loadCommands`/`getCommands`, so the renderer supplies state-backed getters for each kind. Loading commands on the first `/` rather than during connection keeps startup and ordinary chat unchanged, matching the accepted skill behavior.

The catalog is not refreshed on `command.updated`; commands added or removed during a connection appear after the next connection. This is the same lifetime the skill catalog already uses and avoids a second event subscription path in this change.

### Dispatch a leading known command on send

`SynchronizationActions.sendMessage` keeps one entry point and returns whether the message was confirmed. It takes the command path only when the raw text starts with `/` at index 0, ensures the command catalog is loaded, and compares the first token after `/` exactly against loaded command names.

When the token matches:

1. Reject the send with the existing prompt busy/uncertain messages if a prompt is still sending or awaiting reconciliation. `PromptCoordinator` gains a small idle gate so the command path uses the same rules and text as prompts.
2. Resolve `$name` mentions in the argument text with the existing `resolveSkills`, so skill attachment behavior is the same as for prompts.
3. Call `session.command({ sessionID, name, text: arguments, skills })`, omitting `skills` when empty. The arguments are the text after the first token and its delimiter, preserved as entered.
4. On success, refresh the selected session snapshot, clear `actionError`, and report confirmation so the view clears the composer.
5. On failure, publish a fixed command error, keep the composer text, and report no confirmation.

`session.command` is called without the compatibility-translation wrapper used for prompts because its documented `404` also means **command not found**, not only an unsupported endpoint. The action treats the client's command-not-found and command-execution errors as ordinary command failures, while other errors still go through `rejectIncompatible`. This prevents a catalog race from being mislabeled as an incompatible OpenCode API and disabling chat.

When the token does not match, or the catalog is unavailable and therefore empty, the text takes the ordinary prompt path. This keeps unknown `/name` messages and slash-leading prose working, and means an incomplete catalog never silently drops a message.

`ChatView.send` changes from re-reading `pendingPrompt` to clearing the composer when `sendMessage` reports a confirmed delivery. The prompt path reports confirmation only when its pending prompt is admitted, preserving the existing rule that uncertain drafts stay in the composer.

### No invented admission identity for commands

`session.command` returns void and exposes no prompt ID, so the prompt coordinator's identity and message reconciliation cannot apply. A failed command is reported as an ordinary failure; the snapshot and event stream remain the source of truth, and the user can resend manually. The command path is gated on an idle prompt but does not create a pending prompt of its own.

Inventing a local identity and retrying automatically was rejected: it cannot prove that the first request did not execute, so it would risk running a command twice. Treating a command as a prompt and relying on the server to expand it was rejected because the prompt endpoint does not parse slash commands.

## Risks / Trade-offs

- **`session.command` failure may hide a command that actually ran** → The text stays in the composer and no automatic retry occurs; the refreshed conversation shows the result, and resending is the user's decision.
- **A command catalog can go stale during a connection** → Documented; reconnect reloads commands with the rest of the per-connection catalogs.
- **Arguments containing `$name` are also skill mentions** → Only exact loaded skill names are attached, exactly as with ordinary prompts; other `$` text stays literal argument text.
- **A leading token is matched before confirmation** → Matching is exact and case-sensitive against the loaded names, and unknown tokens fall back to prose.
- **The `/` trigger is intentionally narrower than `$`** → It matches the message-leading rule the server dispatch relies on and avoids popovers while typing paths.

## Migration Plan

No data migration. Ship through the normal plugin build and release process; reverting removes the `/` trigger and the command catalog without affecting stored conversations.

## Open Questions

None.
