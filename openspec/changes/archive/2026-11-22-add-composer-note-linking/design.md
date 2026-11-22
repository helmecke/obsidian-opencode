# Design

## Context

The composer (`src/ui/chat-composer.ts`) is a plain `<textarea>`. Its only key handling today is Ctrl/Cmd+Enter to send, and its value drives `resize()` and send-button enablement through the `input` event. The send path (`chat-view.ts` → `SynchronizationCoordinator.sendMessage` → `PromptCoordinator` → `client.session.prompt`) is text-only, and the ack check compares `payload.text` exactly. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Native-feeling bracket pairing and inline note completion in the existing textarea, without changing the send path or prompt shape.
- Reuse Obsidian primitives (`AbstractInputSuggest`/`PopoverSuggest`, `prepareFuzzySearch`, `sortSearchResults`) where they fit, rather than reimplementing the popover.
- Keep the pairing/query/insertion logic unit-testable outside a live Obsidian app.

**Non-Goals:**
- No file-mention attachment to the prompt (text stays a string).
- No alias rows, `#`/`^`/`|` sub-suggestions, or non-Markdown targets.
- No change to the user-message rendering in `conversation.ts`.

## Decisions

### Reuse `AbstractInputSuggest` on the textarea (with a probe)
The composer is a `<textarea>`, but `AbstractInputSuggest` declares `HTMLInputElement | HTMLDivElement`. It only needs `.value`, `input`/`focus`/`blur` events, and `getBoundingClientRect()`, all of which a textarea has, so we pass it cast to `HTMLInputElement`. Rationale: free fuzzy list, keyboard navigation, scope handling, and theming.

Alternatives: a hand-rolled popover (~120 lines, fully testable) or `FuzzySuggestModal`/`SuggestModal` (steals focus mid-typing, rejected). A custom popover is the fallback if the probe shows the cast misbehaves. Two probe checks are called out explicitly in tasks: popover placement in a bottom composer/narrow sidebar, and Ctrl/Cmd+Enter not being swallowed while open.

### Pairing via `keydown` + `setRangeText` + manual `input`
Intercept `keydown` for `[` (no modifiers, not IME-composing): prevent default, insert `[]` with `setRangeText`, place the caret between, then dispatch an `input` event so `resize()` and send-button state stay correct. Skip-over for `]` and empty-pair deletion are handled the same way. Rationale: `setRangeText` gives exact caret control; dispatching `input` keeps every existing value observer working with no extra wiring. Selection wrapping uses the same path.

### Query extraction as a pure function
`linkQueryAt(text, caret)` returns the open query (text after the last unclosed `[[` before the caret) or `null`. This is pure and unit-tested; `getSuggestions` uses it and returns `[]` when it is `null`. After insertion the caret lands after `]]`, so the function returns `null` and the popover does not reopen.

### Suggestion source and ranking
Candidates are `app.vault.getMarkdownFiles()`. Rank by fuzzy match on basename using `prepareFuzzySearch`, tie-break by vault-relative path, then `sortSearchResults`. Rows render basename plus the folder path (with trailing slash) as a muted second line, mirroring Obsidian's link suggest.

### Unambiguous link text
When the chosen basename is unique among Markdown notes, insert `[[Basename]]`; otherwise insert the full vault-relative path without the `.md` extension, using forward slashes, e.g. `[[Acceptance/Other/Example]]`. This is always resolvable from the vault root, matching the existing vault-root source context used by answer links. Minimal disambiguating paths (shortest prefix that separates duplicates) are a possible later refinement, not this change.

### Selection replacement boundaries
The suggest owns a replace range from the `[[` opener to the caret. `selectSuggestion` replaces that span with the resolved link text via `setRangeText`, keeping the surrounding text and the already-paired closing `]]` when present.

## Risks / Trade-offs

- [Textarea cast is off-contract for `AbstractInputSuggest`] → Probe placement and key capture in a real vault first; custom popover fallback is scoped as a task.
- [Popover may anchor below the composer and overflow the window] → Confirm in-vault; a single CSS rule or a custom `setPosition` constrains it, documented as part of the probe task.
- [Popover could swallow Ctrl/Cmd+Enter] → Probe check; if it does, send must be triggered before the popover's key handler consumes it.
- [Programmatic edits bypass native `input`] → Every insertion path dispatches `input`, so `resize()` and send enablement cannot drift.
- [Ambiguous basenames] → Full vault-relative path guarantees resolvability; the duplicate-basename case is covered by a spec scenario.
