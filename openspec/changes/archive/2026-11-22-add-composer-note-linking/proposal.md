# Proposal

## Why

Chat answers already render and resolve `[[wikilinks]]`, but there is no help on the input side: referencing a vault note while composing is manual and error-prone. There is no autocomplete, no disambiguation of duplicate basenames, and typing the literal brackets is awkward. This leaves the user either guessing at paths or copy-pasting from the file explorer.

## What Changes

- The chat composer auto-closes a typed `[` as `[]` with the caret between, matches a typed `]` by skipping over an existing closer, and deletes both brackets when backspacing an empty pair. A selected range is wrapped in `[]` rather than replaced.
- Typing `[[` opens an inline note-completion popover over the vault's Markdown files, matched and ranked with Obsidian's fuzzy search, showing each note's basename with its folder path underneath.
- Selecting a suggestion inserts the shortest unambiguous link text: the basename when it is unique in the vault, otherwise a vault-relative path. The popover is keyboard-navigable and closes on selection, blur, or `Escape`.
- The picked note stays plain prompt text. It is **not** attached to the prompt as an OpenCode file mention, and alias rows and `#`/`^`/`|` sub-suggestions are out of scope for this change.

## Capabilities

### New Capabilities
- `composer-note-linking`: compose-time entry of vault-note references in the chat composer, including the bracket pair gesture, note search and completion, and unambiguous link insertion.

### Modified Capabilities
<!-- none -->

## Impact

- `src/ui/chat-composer.ts` and a new suggestion module under `src/ui/` own the behavior.
- Reuses Obsidian's `AbstractInputSuggest`/`PopoverSuggest` and `prepareFuzzySearch`; no new dependency.
- `styles.css` gains popover/row styles; `tests/` gains unit tests for the pairing and query-extraction logic.
- No change to the send path, prompt identity, or reconciliation — the prompt remains a single text string.
