# Design

## Context

See `proposal.md` for motivation. The chat DOM is built by `ChatRenderer` (meta
bar, status, conversation select, errors), `ChatComposer` (card, textarea,
agent/model selects, send/stop), `FormCard`, `PermissionCard`, `ToolEntryView`,
and `ConversationRenderer`/`MarkdownBlock`. `styles.css` styles all of them.
Tests drive the same elements through `ChatView` getters and direct DOM
selectors in `tests/plugin-shell.test.mjs` and `tests/interactions.test.mjs`.

Host constraints were checked against the installed Obsidian `app.css`/`app.js`
before choosing a replacement:

- Present and stable: `clickable-icon` (transparent icon button with hover,
  focus, active, and `[aria-disabled="true"]` states), global `button`,
  `select`, and `input[type=text]` form styling, `mod-cta`/`mod-destructive`,
  `setting-item` + `setting-item-info`/`-name`/`-description`/`-control`/
  `-error`, `is-invalid`, `callout` + `callout-title`/`-icon`/`-title-inner`/
  `callout-content` with `data-callout`, and `markdown-rendered`.
- Not available as assumed: there is **no** `.text-muted`/`.text-warning`
  utility class (only the `--text-muted`/`--text-warning` variables), so those
  semantic classes stay plugin-owned.
- `ExtraButtonComponent` renders a `div` with `clickable-icon
  extra-setting-button` and toggles `is-disabled`, not a real button.
- `DropdownComponent` renders the select plus a hidden measuring select and
  fitted-width behavior.
- `ButtonComponent` renders a real `<button>` and sets `.disabled`/`mod-cta`,
  but it would add an API wrapper without replacing any current custom styling.
- `Setting` renders the native `setting-item` structure with a single control
  slot and error text via `setting-item-error` + `is-invalid`; it does not model
  multiselect or composite fields.
- The test harness mocks `Setting` as an empty class and has no
  `ButtonComponent`/`setTooltip` mocks, so per-field API use would also expand
  the mock surface.
- `MarkdownRenderer.render` appends rendered content but does not add
  `markdown-rendered` to the container.
- `clickable-icon` disabled appearance is driven by `aria-disabled="true"`, not
  the `disabled` attribute.

## Goals / Non-Goals

**Goals:**

- Replace styling Obsidian already provides with verified native classes and
  public component APIs, without changing what the chat can do.
- Keep every existing accessible name, tooltip, disabled rule, keyboard path,
  and test-covered behavior.
- Make light/dark theme and narrow-sidebar behavior come from the host where
  possible; keep only chat-specific layout rules.
- Make the remaining custom CSS small and easy to audit against the native
  dependencies it relies on.

**Non-Goals:**

- Restructuring the view, moving controls, changing the prompt/form/permission
  flow, or touching the client/protocol/persistence layers.
- Using non-public app internals (for example Obsidian's internal callout
  builder class) or copying declarations out of `app.css`.
- Replacing the composer card, message bubbles, or tool disclosures with native
  equivalents that do not exist.
- Supporting mobile; the plugin stays desktop-only.

## Decisions

### 1. Verify before reusing; then keep a documented allow-list

Only adopt a class or API that is present in the installed `app.css` and either
public in `obsidian.d.ts` or a long-standing app class. At the top of
`styles.css`, list the native surfaces the plugin depends on
(`clickable-icon`, native form controls, `setting-item*`, `callout*`,
`markdown-rendered`) so a future removal is visible. Where no verified class
exists, keep the plugin class and a theme variable — do not invent utility
classes or copy app declarations.

**Alternative considered:** copying relevant Obsidian rules into `styles.css`.
Rejected: that is the duplication being removed and would drift again.

### 2. Icon buttons: native `<button class="clickable-icon">`, not `ExtraButtonComponent`

New conversation, Retry discovery, Stop, and Send keep real `<button>` elements.
Add `clickable-icon` for hover/focus/icon-color behavior and `setTooltip` for
the tooltip/accessible name, then set both `disabled` and
`aria-disabled="true"` so click prevention (real button) and the native disabled
look (`clickable-icon[aria-disabled]`) both apply. Keep `.opencode-composer-icon`
as a sizing/alignment class only, and `.opencode-composer-send` for the accent
circle plus its hover/disabled accent rules; those have no native equivalent.

**Why not `ExtraButtonComponent`:** it creates a `div`, exposes disabled state
as a class, and would weaken button semantics and the existing `.disabled`
assertions. **Why not `ButtonComponent.setIcon`:** it produces the standard
button surface, not the icon-button surface.

### 3. Selects: raw `<select>` with native global styling

The conversation, agent, and model selectors, and form dropdowns, already use
raw `<select>` with plugin option helpers. Obsidian styles every `select`
globally (height, background, border, focus, disabled), so delete the duplicated
color/border/height/hover rules and keep only width, truncation, and flex
constraints. Do not add `dropdown` in the composer toolbar and do not use
`DropdownComponent` there: its hidden measuring select and fitted-width behavior
work against the fixed, truncating toolbar layout.

**Alternative considered:** `DropdownComponent` in the toolbar. Rejected: it
adds a hidden measuring select and fitted-width behavior that conflicts with the
fixed, truncating toolbar layout.

**Alternative considered:** a custom popover menu. Rejected earlier for
keyboard/type-ahead cost; still out of scope.

### 4. Text actions: keep native `<button>` + `mod-cta`

Recovery actions, form Submit/Cancel, and permission decisions already use real
`<button>` elements and inherit native button hover/focus/disabled styling;
Submit and "Allow once" already carry `mod-cta`. Keep that markup, add static
tooltips with `setTooltip` where useful, and delete any button-state CSS rather
than wrapping these controls in `ButtonComponent`. Permission "Allow once" keeps
`mod-cta`; Reject stays a neutral button rather than `mod-warning`, because
approval and rejection are peers and red is not a rejection convention here.

### 5. Agent forms: manual native `setting-item` rows

Each field becomes a native row:
`setting-item` → `setting-item-info` (`setting-item-name` with the required
marker, `setting-item-description`) plus `setting-item-control` (native input,
select, checkbox group, or link). Field errors use `setting-item-error` and the
row's `is-invalid` class; conditional visibility toggles the row's `hidden`
attribute. Field keys, defaults, validation, rebuild-on-schema-change, busy
state, and the answer object stay untouched.

Multiselect checkboxes, the "Other" custom input, and custom-value multiselect
use the same row structure with grouped native checkboxes and a text input, so
all fields share one presentation and one code path.

**Why not the `Setting` API:** it exposes one control slot, cannot express the
composite fields, and adds per-field component instances plus a hidden measuring
select for dropdowns. It would also force a second implementation for
composites and a larger test mock. **Why not keep the custom form markup:** it
duplicates native row, input, and error presentation and is the largest block of
removable CSS.

### 6. Interaction cards: warning callout for permissions, native section for forms

Permission required becomes native callout markup:
`div.callout[data-callout="warning"]` containing `callout-title` (icon +
`callout-title-inner`), and `callout-content` with the action, resources,
persistent-scope warning, and action row. The icon is added with `setIcon`; the
structure matches Obsidian's rendered callouts. Agent forms no longer draw a
custom bordered panel: they use a heading, native `setting-item` rows, and an
actions row, so the rows supply the visual surface.

**Trade-off:** the permission callout and the form section no longer share one
custom card recipe. Accepted: each now follows the host idiom, and no content or
action moves out of reach.

### 7. Markdown answers: add `markdown-rendered`

`MarkdownBlock` adds `markdown-rendered` next to `opencode-markdown`, which
activates native paragraph/heading/list/code typography and the native
first/last-child margin rules. Delete the plugin's duplicate margin rules. Keep
the throttled, generation-checked render loop and per-render child component;
streaming, disposal, and link routing are unchanged.

### 8. Keep chat-specific structures custom

These have no verified native equivalent and stay plugin-owned, using theme
variables only: composer card + auto-growing borderless textarea, message
bubbles/roles/pending status, prompt recovery strip, status line, error strip,
tool `<details>` entry and `pre` output, reasoning disclosure, note-suggestion
rows, and markup-specific truncation. Semantic classes such as
`.opencode-muted` and `.opencode-uncertain` remain because Obsidian exposes the
variables, not the utility classes.

### 9. Preserve DOM order and getters

`ChatRenderer`/`ChatView` getters, `.opencode-form-actions` placement, and field
order are preserved so tests continue to exercise behavior. Only markup and
class assertions change. The icon helper decorates the existing real `<button>`
elements instead of replacing them, so handlers and disabled-state updates keep
working without a second ownership layer.

## Risks / Trade-offs

- **Visible restyle (square icon buttons, native selects, settings-style form
  rows)** → Accepted by the chosen depth; do a manual pass in light, dark, and
  narrow sidebar, and keep the send accent so the primary action stays obvious.
- **`clickable-icon` disabled look needs `aria-disabled`** → Set both attributes
  in one helper and assert both in tests.
- **Manual `setting-item` rows may diverge from the host structure** → Use only
  `setting-item`, `-info`, `-name`, `-description`, `-control`, `setting-item-error`
  and `is-invalid`, keep field order, and re-run the interaction tests; no row
  may swallow field events or hide errors.
- **`setTooltip` is not in the test mock yet** → Add a minimal mock that mirrors
  the real behavior (accessible label/tooltip attribute) and assert the
  accessible name in the shell and interaction tests.
- **`select` inside `setting-item-control` gets `width: 100%` at some widths** →
  Let settings rows size natively and keep the composer toolbar's own width
  constraints; verify narrow layout.
- **Manual callout markup could change across Obsidian versions** → Rely only on
  the verified class names, keep tests on text/actions rather than internals,
  and fall back to the plugin container if a future version removes them.
- **Native classes may differ on older supported Obsidian (1.14.5)** → Use only
  long-standing classes, avoid non-public APIs, verify in the test vault, and
  keep theme variables as the fallback.

## Migration Plan

No persisted data, protocol, or settings change. Implement in this order:
shared icon/tooltip helper → composer and renderer controls → form and
permission cards → markdown class and `styles.css` cleanup → test updates. Run
`npm test`, `npm run lint`, and `npm run build`, reload in the test vault, and
check light/dark themes plus a narrow sidebar. Rollback is a revert of the UI
files and `styles.css`; chat sessions and state are unaffected.
