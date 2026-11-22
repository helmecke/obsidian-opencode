# Design

## Context

See proposal.md. Today `ChatRenderer.build()` creates two fixed rows above the
transcript: `.opencode-chat-header` (title, status, Retry discovery) and
`.opencode-chat-conversations` (conversation select, New conversation).
`ChatComposer` already owns the bottom card: textarea, prompt actions, and a
toolbar with stop, agent, model, and send. That toolbar is the new home for the
status, retry, conversation, and new-conversation controls. `ChatRenderer` keeps
the status and conversation update logic and exposes the elements through getters
that `ChatView` and `tests/plugin-shell.test.mjs` use.

## Goals / Non-Goals

**Goals:**

- Make the composer card the only control surface above/below the transcript.
- Reuse the existing status strings, retry enablement rules, conversation list
  logic, handlers, and getters.
- Keep the card usable in a narrow sidebar by merging the meta controls into the
  wrapping toolbar and using icon actions.
- Keep DOM-based tests meaningful by asserting the new location.

**Non-Goals:**

- New conversation features (tabs, rename, search) or status semantics.
- Changes to synchronization, connection, session, or prompt flows.
- Reworking the message field or the agent/model/send control behavior.

## Decisions

**1. `ChatComposer` owns the card and toolbar layout and exposes a meta
container; `ChatRenderer` still owns the meta widgets and their updates.**
`ChatComposer` creates `.opencode-composer-meta` inside
`.opencode-composer-toolbar-start`, after the reserved Stop slot, and exposes it
via a getter. `ChatRenderer.build()` creates the status, retry icon, select, and
new-conversation icon inside that container, and its existing `updateStatus()` /
`updateConversations()` methods keep writing to the same fields.

- Why: status and conversation updates are driven by `SynchronizationState` and
  the connection/execution label helpers that already live in `ChatRenderer`.
  Moving the widgets into `ChatComposer` would either duplicate those helpers or
  add a second state-update path in the composer. Keeping content ownership in
  the renderer and layout ownership in the composer is the smallest coherent
  split, matching how `ChatRenderer` already fills the interactions panel's
  container.
- Alternative considered: move all meta widgets and update logic into
  `ChatComposer`. Rejected as unnecessary churn and because it would grow the
  composer's state signatures beyond composing concerns.

**2. Meta controls share the bottom toolbar, left-aligned.**
Order inside the toolbar: the reserved Stop slot, conversation select, New
conversation icon, status text, Retry discovery icon, then Agent, Model, and Send
on the right. New conversation and Retry discovery are icon buttons using
`message-square-plus` and `refresh-cw` with tooltips and accessible names; the
Conversation selector keeps its native select behavior but drops its visible
label. The toolbar wraps, and the status stays muted, readable, and able to take
its own line before controls overflow.

- Why: the bottom toolbar is already the point of action, so moving the meta
  controls there reclaims the two fixed rows at the top without adding another
  row. Icon actions keep the left group narrow enough for a sidebar, and flex
  wrap handles the narrow case without a media query or JS measurement.
- Alternative considered: give the meta controls their own row above or below
  the textarea. Rejected because it either restores the top split or adds height
  inside the card, and the toolbar already has the space.

**3. Drop the in-body `OpenCode` heading.**
The view body no longer renders an `h2`; the pane tab and `getDisplayText()`
already name the view.

- Why: the title is redundant and is the main reason the old header needed its
  own row.

**4. Keep the status as live text with an accessible role.**
The status element keeps the same text content and adds `role="status"` with
`aria-live="polite"` so moving it into the toolbar does not reduce its visibility
to assistive technology.

- Why: connection state changes are already announced visually; the role makes
  the same changes available without a new visual element.

**5. Remove obsolete header CSS and document the toolbar.**
Delete `.opencode-chat-header`, `.opencode-chat-heading`, and
`.opencode-chat-conversations` rules; add toolbar meta, icon-button, compact
select, and status styles. Update README's chat section to describe the single
card, the bottom toolbar placement, and the icon actions for retry and new
conversation.

**Spec impact: none.** The `native-chat` consolidated-composer requirement does
not prescribe above/below placement and already requires every control to have
an accessible name, so the delta spec stays as written.

## Risks / Trade-offs

- **Long status strings squeeze the toolbar** → Let the status stay muted and
  wrap within the left group, and let the toolbar wrap onto another line before
  any control is pushed out of reach; keep the text unchanged.
- **Icon-only actions are less obvious** → Use familiar Lucide icons and keep
  tooltips plus accessible names on New conversation and Retry discovery.
- **The toolbar becomes crowded** → Keep the meta group compact with icon
  actions, a label-free select, and a muted status; wrap before overflow.
- **Tests or integrations query `.opencode-chat-header`** → Update the shell
  test to assert both old rows are absent and that the controls are descendants
  of `.opencode-composer-toolbar`; keep the `ChatView` getters unchanged.
- **Keyboard order changes** → The order is Stop, Conversation, New
  conversation, status (not focusable), Retry discovery, then Agent, Model, and
  Send, matching the visual order; no shortcut changes.

## Migration Plan

UI-only change with no persisted data or protocol impact. Ship in the next
plugin version; rollback is a revert of the code and CSS, with no migration
needed.
