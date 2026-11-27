# Proposal

## Why

Agent questions are the one human-decision surface still wearing generic settings chrome: a choice is a dropdown that says "Select…", option descriptions sent by the service are dropped, and the form title sits in a plain heading above unrelated rows. OpenChamber's question card makes the same decision legible at a glance — question header, selectable option rows with descriptions, a recommended option, and an inline custom answer. The plugin should adopt that structure while keeping Obsidian's native look and its existing form behaviour.

## What Changes

- Render each pending form as an Obsidian callout with `data-callout="question"` (help-circle icon, theme accent) instead of an `h3` plus a flat list. The callout title is the form title, or "Agent question" when absent.
- Replace the choice dropdown with stacked option rows: a native radio input for single choice, a native checkbox for multiselect. Each row shows the option label and, when the service sends one, its `description` beneath the label.
- Treat an option label containing `(Recommended)` as the recommended choice: strip the marker from the visible label and show a small muted "Recommended" tag beside it.
- Replace the dropdown's "Other…" entry and its adjacent always-visible input with a final **Other…** row (pencil icon). Selecting the row reveals a text field beneath it; multiselect keeps comma-separated custom values, included only while the row is chosen.
- Move Submit and Cancel into a start-aligned footer: Submit keeps `mod-cta`, Cancel stays a plain native button, and both stay disabled while an answer is in flight. No icons and no success/error tints.
- Keep required markers, inline per-field errors, the form-level error, unsupported-field blocking, conditional visibility, and external-link behaviour unchanged.
- Add scoped styles for the stacked field layout, option rows, recommended tag, revealed custom field, and footer. Pending decisions share the chat's readable line width, and the dock no longer draws a full-width divider above them. No new setting, no transcript card, no copy actions.
- Keep the docked interactions panel as the only place forms render, keep answer payloads and service ownership unchanged, and fix interaction patches so a pending decision no longer discards the live transcript.
- Keep the live conversation visible while a question or permission is pending. Only a confirmed session deletion clears the selection and transcript.
- Update the interaction, synchronization, and style-contract tests to cover option rows, transcript continuity, the reading measure, and focus return.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-interactions`: the **Structured agent forms** requirement gains the question-callout presentation, selectable option rows with per-option descriptions, a recommended marker, and a revealed custom-answer row, while preserving submission, cancellation, visibility, and external-link behaviour. The capability also gains requirements that pending decisions follow the reading measure and keep the live transcript.

## Impact

- `src/ui/form-card.ts`: card shell, field layout, choice and multiselect controls, custom answer.
- `src/ui/chat-interactions-panel.ts`: focus restoration for the forms group.
- `src/state/synchronization.ts`: interaction patches keep ingestion and the prompt unless the selection was deleted.
- `styles.css`: scoped form and dock styles; relies on Obsidian's `callout*` and `setting-item*` surfaces plus theme variables.
- `tests/interactions.test.mjs`, `tests/synchronization.test.mjs`, `tests/style-contract.test.mjs`: card, transcript-continuity, reading-measure, and focus coverage.
- `docs/runtime-compatibility.md`: live evidence and the interaction-patch diagnosis.
- No changes to the client contract, settings schema, persisted data, or dependencies.
