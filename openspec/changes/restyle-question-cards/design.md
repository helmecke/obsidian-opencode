# Design

## Context

`FormCard` builds an unstyled `.opencode-form` container: an `h3` for the form title, `.opencode-form-fields` holding one `.setting-item` row per field, an error line, and an action row. A `string` field with `options` becomes a native `<select>` with a "Select…" placeholder; a `multiselect` becomes a checkbox group plus, when `custom` is set, an always-visible comma-separated text input. `FormOption.description` is part of the client contract (`FormOption` in `@opencode/client`) but the renderer never reads it. Everything else — validation, visibility conditions, required handling, answer assembly — already operates on `FormValues` independently of the control used.

`ChatInteractionsPanel` renders forms in the docked interactions area, reuses a `FormCard` across updates, and keeps in-progress values. Obsidian ships a `question` callout (`--callout-question: var(--color-orange)`, `--callout-icon: help-circle`), and `renderPermissionCard` already composes native `callout` classes at runtime.

## Goals / Non-Goals

**Goals:**

- Make an agent question read as a decision card: question header, stacked choice rows, recommended option, revealed custom answer, calm footer.
- Stay native: callout anatomy, native radio/checkbox, `setting-item` typography, theme variables only.
- Keep the answer payload, validation, visibility, reconciliation and focus behaviour byte-for-byte compatible.

**Non-Goals:**

- Moving forms into the transcript, adding a setting, or copying questions as Markdown/JSON.
- Changing the docked panel's height, scrolling, focus restoration or announcement logic.
- Disabling inputs while an answer is in flight (buttons keep their current busy behaviour).

## Decisions

### Native question callout, not a bespoke card

The card element keeps `opencode-form` and adds `callout`, with `data-callout="question"`. Its title row uses `callout-title` → `callout-icon` (`setIcon(..., 'help-circle')`) and `callout-title-inner` holding `form.title.trim() || 'Agent question'`. Fields, the form-level error and the action row move into `callout-content`.

Why: the permission card already establishes callout composition, Obsidian owns the icon and color per theme, and orange already signals "waiting on you". A custom bordered card would duplicate chrome and hardcode tones. The `h3` disappears; the callout title replaces it, so the card has one heading rather than two.

### Stacked fields, native row typography

Each field keeps `.setting-item.opencode-form-field` and `.setting-item-info` / `.setting-item-name` / `.setting-item-description` for typography and error styling, but `.opencode-form-field` lays the row out as a column with the control spanning the width. This reverses only layout, not typography or theme hooks. Text, number, boolean, external and error rows reuse their current markup.

Why: the dock is narrow; a right-aligned control column cannot carry option rows. Keeping native class names preserves spacing, divider and theme behaviour. A fully custom field block would have to copy those declarations.

### Choice rows are native inputs

- Single choice: `role="radiogroup"` container labelled by the field title (`aria-labelledby`), one `<label class="opencode-form-option">` per option wrapping `<input type="radio" name="opencode-form-<uid>-<key>">`, the stripped label, an optional description line, and the recommended tag.
- Multiselect: the existing group container, one `<label class="opencode-form-option">` per option wrapping `<input type="checkbox">`; selected values keep their current array shape.
- Option descriptions render as `.opencode-form-option-description` under the label, indented to the text column, muted.
- Required stays the current ` *` suffix on the field title.

Why: native inputs give keyboard navigation, focus rings and screen-reader semantics without reimplementing selection. OpenChamber's tinted button rows were considered and rejected because they re-create radio semantics and hover/focus states.

### Recommended marker

A label matching `/\s*\(recommended\)\s*/i` is recommended. The visible label is `label.replace(marker, ' ').trim()` and a `Recommended` tag is appended. Detection mirrors OpenChamber; the tag is text, not the only signal, and the option stays selected normally.

### Custom answer is a revealed row

`string` with `options` and `custom`: append a final label row with a pencil icon (`setIcon(..., 'edit')`) and the text "Other…", implemented as a radio whose value is an internal sentinel. Selecting it reveals `.opencode-form-custom` with a text input under the rows and focuses it; the field value becomes the typed text. Re-selecting a normal option hides the input and restores that option's value; the last custom text is kept in a private map so toggling back does not lose it.

`multiselect` with `custom`: the same row is a checkbox. While checked, the comma-separated custom input is revealed and its entries are appended to the selected values; while unchecked, they are excluded. This replaces the always-visible input but keeps the existing split-on-comma behaviour and answer shape.

The sentinel and custom text live on the card, not in `FormValues`, so `validateForm` and the submitted answer keep their existing types. A choice field cannot be cleared once selected — the same limitation a radio group has in OpenChamber — and this is accepted.

### Footer and errors

The footer stays `.opencode-form-actions` after the callout content rows: `Submit` with `mod-cta`, then plain `Cancel`, start-aligned, both disabled while `busy`. Per-field `.setting-item-error` lines stay inside their field; `.opencode-form-error` stays above the actions for unsupported fields and the form-level retry message. `aria-live="polite"` and `aria-describedby` wiring stay as they are.

### Styles

Add a scoped `.opencode-form` block in `styles.css`: callout-content spacing, column field layout, option row layout and hover, description indentation, recommended tag (`--text-accent`, `--font-ui-smaller`), custom row reveal, and footer alignment. No hardcoded colors, no `!important`, no `:has`. Native callout and setting-item surfaces are documented in the existing file comment.

## Risks / Trade-offs

- [Theme-specific `.setting-item` flex rules could override the column layout] → scope overrides to `.opencode-form .opencode-form-field` and cover the class contract in `tests/style-contract.test.mjs`.
- [Radio groups cannot return to "no answer" for optional choices] → accepted; matches OpenChamber and the field is optional only in validation, not in interaction.
- [Taller forms reduce visible transcript in the 45% dock] → compact option spacing and reserved error slots keep a question with five options near the previous height; the panel already scrolls.
- [Stripping `(Recommended)` could remove intentional label text] → mirror OpenChamber's marker exactly and only strip that parenthesised phrase.
- [Existing interactions tests query `select`] → rewrite those assertions against option rows and dispatch `change` on the native inputs; keep the payload assertions unchanged.

## Migration Plan

No persisted data or settings change. Ship with the plugin; no rollback beyond reverting the commit. Manual acceptance in a disposable vault: send a form with options, descriptions, a recommended label and `custom: true`, then answer by row, by Other…, by multiselect, and cancel a second form.

## Open Questions

None.
