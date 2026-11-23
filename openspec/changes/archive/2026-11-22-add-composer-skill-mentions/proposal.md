# Proposal

## Why

The composer can link vault notes with `[[`, but it has no way to invoke the skills that OpenCode exposes to a session. Users who know a skill's name must remember it and type it by hand, and the plugin does not tell OpenCode which skills the message references. OpenChamber already offers this through `$` completion; the plugin should provide the same focused workflow.

## What Changes

- Typing `$` at a word boundary in the chat composer opens an inline, keyboard-navigable list of OpenCode skills available to the vault.
- The list is filtered and ranked as the user types a skill name; each row shows the skill name and its description when one is available.
- Selecting a skill replaces the `$query` text with `$skill-name ` and leaves the caret after the inserted mention.
- Sending a message that mentions known skills attaches those skills to the prompt by ID, so OpenCode receives both the unchanged message text and structured skill references. Duplicate mentions attach a skill once; unknown `$name` text stays plain text.
- Skill loading is lazy and non-fatal: opening the picker loads the skill catalog for the vault, and a failure to load it does not block composing or sending messages.

Out of scope: a skill picker button in the composer toolbar, skill management or installation, displaying activated skills in the transcript, and fallback instruction messages for unresolved skill names.

## Capabilities

### New Capabilities

- `composer-skill-mentions`: Triggering, filtering, selecting, and sending OpenCode skill mentions from the chat composer.

### Modified Capabilities

None. Existing composer-note-linking and native-chat requirements remain unchanged.

## Impact

- `src/ui/chat-composer.ts`, `src/ui/chat-renderer.ts`, and `src/ui/chat-view.ts` for the composer trigger and send path.
- A composer suggestion module (replacing or extending the note-only suggestion) and `src/ui/composer-link.ts` helpers for `$` token detection and insertion.
- `src/opencode/api-contract.ts` and a shape validator for `skill.list`.
- `src/state/synchronization.ts`, `src/state/synchronization-actions.ts`, `src/state/synchronization-model.ts`, and `src/state/prompt-coordinator.ts` for lazy skill loading and prompt skill attachments.
- `styles.css` for the skill suggestion rows and empty/loading state.
- Unit and DOM tests under `tests/` for trigger detection, insertion, ranking, and prompt attachment behavior.
