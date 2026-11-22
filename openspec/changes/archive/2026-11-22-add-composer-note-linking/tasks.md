# Tasks

## 1. Pure text logic and tests

- [x] 1.1 Add `src/ui/composer-link.ts` with `linkQueryAt(text, caret)` returning the open query after the last unclosed `[[` (or `null`) and `linkInsertText(basename, path, unique)` returning `[[Basename]]` or the vault-relative `[[path/Basename]]`; verify `npm run test` passes new cases for a mid-text query, a closed `[[a]]`, no-opener, and unique/duplicate basenames
- [x] 1.2 Add pairing helpers `applyOpenBracket`, `applyCloseBracket`, and `deleteEmptyPair` that map `{value, selectionStart, selectionEnd}` to a new value and selection for open, skip-over, empty-pair backspace, and selection wrap; verify `npm run test` passes cases for each of those four gestures

## 2. Note completion popover

- [x] 2.1 Add `NoteLinkSuggest extends AbstractInputSuggest<TFile>` that returns `[]` when `linkQueryAt` is `null`, otherwise ranks `app.vault.getMarkdownFiles()` with `prepareFuzzySearch`/`sortSearchResults` and renders basename plus a muted folder path; verify `npm run build` succeeds and the module unit test covers the empty-query path
- [x] 2.2 Implement `selectSuggestion` to replace the span from the `[[` opener to the caret with the resolved link text via `setRangeText`, place the caret after the closing brackets, and dispatch an `input` event; verify a jsdom-level test (or stubbed input element) shows the popover does not reopen after insertion because `linkQueryAt` returns `null`

## 3. Composer wiring

- [x] 3.1 In `ChatComposer`, intercept `keydown` for `[`, `]`, and empty-pair Backspace using the 1.2 helpers, calling `setRangeText` and dispatching `input` so `resize()` and send-button state refresh; verify `npm run test` confirms a programmatic edit still enables the send button
- [x] 3.2 Instantiate `NoteLinkSuggest` with the composer textarea (cast to `HTMLInputElement`) and register it on the view's `Component` for unload cleanup; verify in a vault that typing `[[` opens the popover and `Escape`/blur closes it

## 4. Styling and acceptance

- [x] 4.1 Add `styles.css` rules for suggestion rows (basename plus muted folder path) and any popover placement fix for the bottom composer; verify light/dark themes and a narrow sidebar render legibly
- [x] 4.2 Manual acceptance in a vault with duplicate basenames: type `[[`, confirm rows show name and folder, select a duplicate to get `[[folder/Note]]`, confirm Ctrl/Cmd+Enter still sends while the popover is open; verify `npm run build` and `npm run test` pass and the plugin reloads cleanly

## Workflow follow-up

- [x] Document composer note linking in `README.md` and record the live acceptance and delivery metrics in `docs/runtime-compatibility.md`; no `adr.md`/`adr/` or TRACEABILITY manifest exists in this repository.
- Archive the change after the project's review requirements are satisfied.
- Verify the archived result against the main `composer-note-linking` spec.
