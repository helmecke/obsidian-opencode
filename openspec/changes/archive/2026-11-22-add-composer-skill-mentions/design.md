# Design

## Context

See `proposal.md` for motivation and `specs/composer-skill-mentions/spec.md` for the behavior contract.

The composer already has one inline completion path: `NoteLinkSuggest` extends Obsidian's `AbstractInputSuggest<TFile>`, detects an unclosed `[[` with `linkQueryAt`, inserts a note link, and registers a view-local Mod+Enter handler so sending still works while its popover is open.

Sending currently flows from `ChatView.send` through `SynchronizationCoordinator.sendMessage(text)` into `PromptCoordinator.send(text)`, which calls `client.session.prompt({ sessionID, id, text })`. `SynchronizationState` carries the server-backed agent and model selectors loaded during connection and by `loadOptions`.

The installed `@opencode/client` 2.2.2 already exposes `client.skill.list({ location })`, returning `{ location, data: SkillInfo[] }`, and `session.prompt` accepts `skills?: { id: string }[]`. The plugin does not use either yet.

## Goals / Non-Goals

**Goals:**

- Add `$` completion without a second popover controller or a second send shortcut.
- Keep skill loading out of the connection's required selector work and out of startup.
- Resolve mentions to server skill IDs at send time so manually typed mentions work too.
- Preserve the existing prompt-identity and uncertain-send guarantees when skills are attached.

**Non-Goals:**

- No skill management, installation, enable/disable, or catalog browsing UI.
- No new composer toolbar control.
- No display of activated skills in the transcript.
- No synthetic fallback instruction for unresolved skill names.

## Decisions

### One composer suggestion controller for notes and skills

Replace the note-only suggestion class with a composer suggestion class that handles both `[[` and `$`. It keeps one `AbstractInputSuggest` instance, one popover, and one Mod+Enter scope. Trigger detection checks the note trigger first, then the skill trigger.

Two separate `AbstractInputSuggest` instances were considered and rejected: both would register their own Mod+Enter handler and could send the same message twice, and both would race to open a popover on every input event.

The skill trigger mirrors OpenChamber's rule: a `$` at the start of the input or after whitespace, with no whitespace or newline between the `$` and the caret. A shared helper detects the query and the span to replace, so the picker and send-time scanning agree on what counts as a mention. Selecting replaces that span with `$name ` and places the caret after the space; the trailing space stops the trigger from reopening immediately.

### Lazy catalog with a coordinator-owned cache

Add a `loadSkills()` action and a `skills?: readonly SkillInfo[]` field to synchronization state. The suggestion controller awaits `loadSkills()` only when a `$` query is present. The first successful request publishes the catalog; subsequent requests reuse it. The in-flight promise is shared so repeated keystrokes do not issue duplicate requests. A failed request publishes an empty catalog so the composer stays usable and the failure is not retried on every keystroke.

Loading skills during the initial connection pass or during `loadOptions` was rejected: `SkillInfo` includes each skill's full content, and most messages do not mention a skill. The catalog is directory-scoped, so it can live for the lifetime of the coordinator's connection.

The catalog request is optional. It is validated like the other catalog endpoints, but a validation or transport failure is caught by `loadSkills()` rather than being passed to `rejectIncompatible`, because skills do not gate core chat behavior.

### Resolve mentions when sending, not when inserting

`SynchronizationActions.sendMessage(text)` first ensures the catalog is loaded, then scans the text for `$name` tokens whose names exactly match a loaded skill. It maps each unique match to the server's skill ID and passes the IDs to `PromptCoordinator.send(text, skillIDs)`.

Scanning at send time, rather than tracking picker selections, matches OpenChamber and means a manually typed known `$name` is attached too. Unknown names stay as text. If the catalog is unavailable, the ID list is empty and the text is sent unchanged.

Resolving inside `PromptCoordinator` was considered and rejected: it would make the coordinator responsible for catalog requests and for deciding which mentions are valid, expanding its admission/reconciliation role.

### Keep attachment identity on retry

`PendingPrompt` stores the resolved skill IDs next to the text. `transmit()` sends `skills: ids.map((id) => ({ id }))`, and `retry()` reuses the same IDs with the same prompt ID. The acknowledgment check continues to compare only the prompt ID, session, and text, because skill IDs are already part of the transmitted request rather than proof of admission.

Only `{ id }` is sent, with no `mention` offsets. The `$name` text is already in the prompt, and offsets would go stale if the user edits the message before the retry. OpenChamber also sends ID-only attachments.

### Row content and styling

Rows show the skill name and its description when present, using dedicated `opencode-skill-suggestion*` classes alongside the existing suggestion styles. The OpenCode skill payload has no project/user scope field, so scope is not shown. Empty and loading states need no custom row: the standard suggestion popover stays closed while there are no results.

## Risks / Trade-offs

- **Skill catalog includes full content and can be large** → Load only on the first `$` trigger and cache for the connection lifetime.
- **A failed catalog request silently disables structured attachments** → The mention text still sends normally; reloading the plugin or reconnecting can reload the catalog. The feature does not block chat.
- **Trigger detection and send-time scanning can drift** → Both use the same token helpers and the same exact-name comparison.
- **Async suggestions can return results for a query the user has already changed** → `getSuggestions` derives its query from the current caret on every call, and the catalog request is deduplicated rather than queued.
- **A skill can disappear between selection and send** → Resolution uses the catalog at send time; missing IDs are omitted and the text remains.

## Migration Plan

No data migration. Ship through the normal plugin build and release process; reverting the change removes the `$` trigger and the `skills` field from outgoing prompts without affecting stored conversations.

## Open Questions

None.
