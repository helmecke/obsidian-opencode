# Design

## Context

See `proposal.md` for motivation and `specs/native-chat/spec.md` for the new
requirement. The current DOM is built in two places: `ChatRenderer.build()`
creates the header with the agent/model selects and stop button, while
`ChatComposer` creates only the textarea, a text **Send** button, and the
uncertain-send strip. `ChatRenderer.updateSelectors()` fills and disables the
header selects; `ChatComposer.update()` owns send/stop-adjacent state and input
disablement. `ChatView` exposes the existing elements through getters, and
`tests/plugin-shell.test.mjs` drives those getters directly.

Relevant constraints:

- Obsidian CSS variables (`--background-primary`, `--background-modifier-border`,
  `--interactive-accent`, `--text-muted`, `--radius-l`, …) are the only theme
  surface; no hard-coded light/dark colors.
- The chat view runs in both main tabs and narrow sidebars.
- `setIcon` is available from `obsidian` and renders theme-inherited Lucide
  icons. No custom icon assets are needed.
- `@opencode/client` shape, synchronization state, prompt flow, and all server
  calls stay untouched.

## Goals / Non-Goals

**Goals:**

- One composer card containing the field and a bottom control row, visually
  close to the supplied OpenChamber screenshot.
- All existing controls remain functional and testable through the current
  `ChatView` getters.
- Works in narrow sidebars and both light/dark themes without horizontal
  scrolling.

**Non-Goals:**

- Recreating OpenChamber's attach menu, voice input, command/skill/mention
  pickers, shield, or target controls.
- Custom popover menus for agent/model selection; native `<select>` behavior is
  retained.
- Changing header, conversation bar, message rendering, or interaction cards.
- Any change to sizing/persistence of the plugin or server protocol.

## Decisions

### 1. `ChatComposer` owns the whole card and its controls

Move the agent select, model select, stop button, and send button into
`ChatComposer`, which creates:

```
.opencode-chat-composer
└─ .opencode-composer-card
   ├─ textarea.opencode-chat-input
   ├─ .opencode-composer-toolbar
   │  ├─ .opencode-composer-toolbar-start  (stop button, when executing)
   │  └─ .opencode-composer-toolbar-end    (agent select, model select, send)
   └─ .opencode-chat-prompt-actions        (uncertain-send recovery)
```

`ChatComposer` receives the select actions through new handlers (`setAgent`,
`setModel`, `stop`) and performs option filling/disabled-state updates from the
same `SynchronizationState` already passed to `update()`. `ChatRenderer` keeps
its `agentSelect`, `modelSelect`, `stopButton`, and `sendButton` getters by
delegating to the composer, so `ChatView` and the existing tests stay stable.

**Why not keep selects in the header and only restyle?** The target places them
inside the card. Moving them requires DOM ownership anyway; keeping them in
`ChatRenderer` while inserting them into a composer-built toolbar would make
two components mutate one element and complicate cleanup on reopen. A single
owner is less error-prone.

**Alternative considered:** a separate `ComposerToolbar` component injected into
`ChatComposer`. Rejected for now: it adds a second stateful component for three
controls, while `ChatComposer` remains well under the project's split threshold.

### 2. Native `<select>` elements styled as compact pills

Keep the existing option-building helpers (`fillAgentOptions`,
`fillModelOptions`, `modelValue`, `modelKey`) and render the selects with
`appearance: none`-style pill CSS inside the toolbar. Preserve full option text
for disambiguation, and set the select's `title`/`aria-label` to the selected
value (for example `Model: opencode · DeepSeek V4.1 Flash / standard`). In the
collapsed pill, long labels are clipped with `text-overflow: ellipsis`; the
title exposes the full value.

**Why not custom menus?** Native selects already provide keyboard navigation,
type-ahead, focus handling, and theme styling in Obsidian; a custom popover would
duplicate that and add focus-trap and positioning work with no requirement
behind it. Visual parity is achieved by the pill shell, not by replacing the
control.

**Agent/model labels:** agent options keep `agent.name || agent.id`. Model
options keep `providerID · name` from the helper so duplicate names remain
distinguishable; CSS constrains the closed pill width. No provider prefix is
added to the send button or elsewhere.

### 3. Icon-only send and stop controls

Import `setIcon` from `obsidian`:

- Send: `arrow-up` inside a circular accent button, `aria-label="Send message"`,
  `title="Send message (Ctrl/Cmd+Enter)"`.
- Stop: `square` inside a neutral circular button, `aria-label="Stop execution"`,
  title explaining interruption. The start slot exists only while
  `state.conversation?.execution === 'running'`; otherwise it is removed/hidden,
  not left as a disabled decorative icon.

The send button stays in the DOM (disabled when the input is empty, the session
is not ready, an interaction is busy, or a prompt is pending) because it is a
primary affordance and tests assert its disabled state. Existing disabled logic
moves into `ChatComposer` unchanged.

**Alternative considered:** keeping text **Send**/**Stop**. Rejected because the
OpenChamber reference uses icon controls and a text button would not match the
card's compact toolbar.

### 4. Keyboard shortcuts and focus behavior stay as-is

`Mod+Enter` continues to be registered by `ChatRenderer` against
`composer.element`; the textarea keeps `Ctrl/Cmd+Enter` send and
`Shift+Enter` newline. The card gets a `:focus-within` ring using
`--interactive-accent` so keyboard focus is visible even though the textarea
border is removed. All icon buttons use `focus-visible` outlines and remain in
tab order only when meaningful (stop only while running).

### 5. Auto-growing field with a hard cap

The textarea starts at roughly two lines, uses `resize: none`, and grows by
setting `height: auto` then `height: min(scrollHeight, 40vh)` on input. It
scrolls internally beyond the cap. This mirrors the expanding OpenChamber card
without letting the composer consume the conversation area. Programmatic
`setText`/`clearIf` call `resize()` so restored drafts size correctly. In a
hidden or zero-height view, the calculation is skipped when `scrollHeight` is 0.

### 6. Uncertainty and disabled states remain in the card

The uncertain-send row moves inside the card under the toolbar, separated by a
subtle top border and using the existing warning/muted classes. It keeps
**Reconcile and retry** and **Return text to editor**. When empty it collapses
(`:empty { display: none }`). The accepted-prompt message stays in the same row.

### 7. Styling approach

The outer `.opencode-chat-composer` becomes a transparent, padded footer region;
`.opencode-composer-card` supplies the border, radius, padding, and
`background-primary` surface. Toolbar uses flexbox with `flex-wrap: wrap`, the
start group aligned left, the end group aligned right. Selects use
`min-width: 0`, `max-width` around 13–15 em on wide views, and shrink/truncate
first on narrow views; send stays a fixed 2.25–2.5 rem circle. No hard-coded
colors, and every state (hover, focus, disabled) uses Obsidian variables.

**Trade-off:** native selects do not display leading icons like the reference.
Adding decorative icon spans would create inert affordances, which the spec
forbids; the pill shape, muted text, and compact spacing carry the visual match.

## Risks / Trade-offs

- **Native select styling differs across Obsidian themes** → Scope overrides to
  `.opencode-composer-card select`, rely on theme variables, and verify in a
  light theme, a dark theme, and the default theme during implementation.
- **Removing selects from the header breaks tests or integrations** → Keep
  `ChatView`/`ChatRenderer` getters and update DOM-structure assertions rather
  than removing coverage; manual verification of agent/model switching.
- **Icon-only controls are less discoverable** → `aria-label` plus tooltip on
  every icon button; send remains visibly accent-colored and stop only appears
  during execution.
- **Auto-grow can fight user resizing or infinite growth** → Fixed cap of 40vh,
  internal scroll beyond it, and no manual resize handle.
- **Narrow sidebar makes the toolbar crowded** → Allow wrapping into two rows,
  truncate the model pill first, and keep the send button fixed-size; verify at a
  narrow sidebar width.
- **Duplicate id/class changes leak into existing selectors** → Reuse existing
  class names (`opencode-chat-input`, `opencode-chat-prompt-actions`) and only
  add new `opencode-composer-*` classes for the card and toolbar.

## Migration Plan

No persisted data, API, or protocol changes, so no migration is needed. The
change ships in a normal plugin build: update source and CSS, run `npm test`,
`npm run lint`, and `npm run build`, then reload the plugin in a test vault.
Rollback is a revert of the UI files and `styles.css`; chat state and sessions
are unaffected.
