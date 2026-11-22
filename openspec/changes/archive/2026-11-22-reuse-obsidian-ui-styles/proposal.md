# Proposal

## Why

`styles.css` has grown to roughly 10 KB of rules that re-create UI Obsidian
already ships: icon-button states, select styling, form rows, card surfaces, and
markdown margins. Duplicated app styling drifts from theme and accessibility
updates, produces small inconsistencies between controls (hover, focus,
disabled, narrow layouts), and makes every visual adjustment a manual patch of
Obsidian behavior. Reusing the host's verified classes and component APIs where
they genuinely fit keeps the chat native, shrinks the stylesheet, and inherits
future theme work for free.

## What Changes

- Adopt Obsidian's icon-button surface: render New conversation, Retry
  discovery, Stop, and Send as real `<button>` elements with the native
  `clickable-icon` class, `setIcon`, and `setTooltip`, instead of the custom
  `.opencode-composer-icon` state machine. Keep a single plugin-specific accent
  rule for the circular Send button, which has no native equivalent.
- Replace custom select styling with Obsidian's global native `select`
  presentation; retain only width/truncation rules needed for the composer
  toolbar and narrow sidebars. The conversation, agent, and model selectors and
  form dropdowns all use it. Do not adopt `DropdownComponent` in the
  composer: its hidden measuring select and fitted width fight the compact,
  truncating toolbar.
- Keep native `<button>` elements and the existing `mod-cta` primary styling for
  text actions (Reconcile and retry, Return text to editor, Submit, Cancel,
  permission decisions), and delete duplicated button-state CSS rather than
  adding a component layer. `ButtonComponent` is not used: it would add an API
  wrapper without replacing any current custom styling.
- Build agent-form fields on the native `setting-item` structure
  (`setting-item-info`, `setting-item-name`, `setting-item-description`,
  `setting-item-control`, `setting-item-error`, `is-invalid`) with native
  inputs, checkboxes, and selects. Keep validation, visibility, and the
  composite fields (multiselect, custom "Other" input) in `FormCard`; the
  `Setting` API is not used per field because it exposes one control slot and
  does not model those composites or field-level rebuilds.
- Present Permission required as an Obsidian warning callout (`callout` with
  `data-callout="warning"`, title, icon, and content) instead of a bespoke
  bordered panel, while keeping every action and the persistent-scope warning
  inside it. Agent-form sections use native `setting-item` rows without an
  outer custom card.
- Use native markdown presentation: mark the rendered answer container with
  `markdown-rendered` and delete the duplicated first/last-child margin rules;
  keep chat-specific bubbles, roles, tool entries, and reasoning disclosure.
- Use `setTooltip` for static tooltips so the tooltip surface and accessible
  name come from Obsidian, and keep explicit `aria-label` updates only where the
  label changes with state (dynamic select descriptions, status).
- Delete every `styles.css` rule whose behavior is fully supplied by a verified
  native class, and annotate the remaining chat-specific classes. Keep semantic
  classes such as `.opencode-muted` only where Obsidian exposes no class (it
  exposes the `--text-muted` variable, not a utility class).
- No functional, protocol, persistence, manifest, or dependency changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a presentation refactor: the existing `native-chat` (theme-aware,
keyboard-accessible, unified composer) and `agent-interactions` (structured
forms, explicit permission decisions) requirements stay unchanged and are
re-verified. The change opts out of spec deltas with `skip_specs: true` in
`.openspec.yaml` because no externally required behavior is added, removed, or
relaxed.

## Impact

- `src/ui/chat-composer.ts`, `chat-renderer.ts`: icon buttons, selects,
  tooltips, and recovery actions move to native components/classes.
- `src/ui/form-card.ts`, `permission-card.ts`: `setting-item` rows, callout
  containers, and native buttons/controls.
- `src/ui/conversation.ts`, `markdown.ts`, `tool-entry.ts`: `markdown-rendered`
  container and reduced custom presentation; message/tool structures kept.
- `styles.css`: duplicated icon, select, form, card, and markdown rules removed;
  remaining chat-specific rules documented.
- `tests/plugin-shell.test.mjs`, `tests/interactions.test.mjs`: selectors and
  class assertions updated for the native markup; behavior coverage preserved.
- No API, schema, persistence, protocol, or release-artifact changes.
