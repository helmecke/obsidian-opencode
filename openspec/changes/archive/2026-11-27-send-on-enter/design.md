# Design

## Context

See `proposal.md` — Why. The relevant current state:

- `ChatComposer` owns one `keydown` listener on the textarea
  (`src/ui/chat-composer.ts`). It sends on `Enter` with `Ctrl`/`Cmd`, then passes
  everything else to `applyPairingKey`, which already ignores
  `event.isComposing` and modified keys.
- The textarea's send availability is computed inside `update()` and applied to
  `sendButtonEl` with `setNativeDisabled`, while `sendButtonEl` is hidden during
  execution. `ChatView.send()` itself guards only read-only and empty text.
- Sending is reachable from three key paths today: that DOM listener, a
  view-local `Mod+Enter` scope (`src/ui/chat-renderer.ts`), and the completion
  popover's own `Mod+Enter` scope (`src/ui/composer-suggest.ts`). The scopes
  exist because Obsidian's keymap handles trusted shortcuts before DOM bubbling.
- `ComposerSuggest` extends Obsidian's `AbstractInputSuggest`, whose scope owns
  `Enter` and `Tab` while the popover is open.

## Goals / Non-Goals

**Goals:**

- One sending rule that holds in every composer state.
- Popover completion keeps working exactly as it does now.
- No key handling scattered across a DOM listener and two keymap scopes.

**Non-Goals:**

- A configurable keybinding, or a setting of any kind.
- Changing `Enter` in the conversation title, session switcher, permission
  cards, or form inputs.
- Sending a message with attachments but no text (still blocked by `send()`).
- Any change to command dispatch, recovery, or prompt identity.

## Decisions

### Plain `Enter` is handled in the composer's own DOM listener

The check joins the existing textarea `keydown` listener rather than a keymap
scope. Plain `Enter` is not an Obsidian hotkey, so the listener receives it, and
handling it at the target keeps it scoped to the composer without claiming
`Enter` from every other control in the view.

Alternative rejected: registering `Enter` with no modifiers on the view scope.
Obsidian's keymap would then own `Enter` for the whole view, so every input,
button, and permission control inside it would need a focus check to keep native
behavior.

The listener runs in this order:

1. Return when the composer is read-only (the textarea is hidden then).
2. Let everything that is not `Enter` fall through to `applyPairingKey`.
3. Return without acting when the key is not a plain `Enter`: `Shift`, `Ctrl`,
   `Cmd`, or `Alt` means the browser's own newline, as decided for
   modified `Enter`.
4. Return when `event.isComposing`, when `event.keyCode === 229`, or when
   `event.repeat` is set, and when `event.defaultPrevented` is already true.
5. Return when a completion popover owns the key (below).
6. `preventDefault()` unconditionally for a plain `Enter`, then send only when the
   send action is available.

`preventDefault()` before the availability check is what makes the key inert
rather than a newline in blocked states.

### Send availability is one predicate shared with the send button

`update()` already decides whether the send button is disabled from the phase,
the draft or selection, `interactionBusy`, the pending prompt's phase, and the
trimmed text. That expression moves into a private `canSend(state)` used both by
`update()` and by the `Enter` path, so the key can never send where the button
would refuse — including the admitted-but-unconfirmed prompt state that must not
produce a second prompt with a new identity.

Alternative rejected: letting `Enter` call `handlers.send()` unconditionally and
relying on `ChatView.send()`. That only guards read-only and empty text; it would
send during an interaction or while a prompt's admission is still unknown.

### The completion popover reports whether it owns `Enter`

While the popover is open its scope handles `Enter` to accept a row, but the
textarea listener is attached at the target and may run before, after, or not at
all depending on how Obsidian's keymap and `AbstractInputSuggest` dispatch the
event. Relying on that ordering would be fragile, and `PopoverSuggest` exposes no
public "is open" accessor (only `open()` and `close()`), so `ComposerSuggest`
tracks its own flag by overriding those two public methods and returns it through
a getter.

The renderer, which owns both objects, passes that getter to `ChatComposer` as a
guard. `event.defaultPrevented` is checked as well, so a keymap layer that claims
`Enter` first still leaves the message unsent.

Alternative rejected: reading `AbstractInputSuggest.isOpen`; it is not in
`obsidian.d.ts`, and this project does not depend on undocumented members.

### Both `Mod+Enter` registrations are removed

With no send chord, the view-local scope in `chat-renderer.ts` and the popover
scope handler in `composer-suggest.ts` have nothing to do. `ComposerSuggest`
drops its `onSend` constructor parameter, which also removes the reason the
popover needed a send callback.

### Copy

The placeholder loses its key hint and reads `Plan, build, or ask.` The send
button's existing `Send message` tooltip is already accurate and stays. The README
composer section names `Enter` and `Shift+Enter`, and `CHANGELOG.md` records the
swap in its Unreleased section, including that `Ctrl/Cmd+Enter` no longer sends.

## Risks / Trade-offs

- **Accidental sends while writing prose** → `Shift+Enter` is the documented
  newline; the composer keeps its auto-growing textarea, and nothing else can
  soften the cost without defeating the change.
- **Existing users press the old chord and get a newline** → the CHANGELOG
  bullet and README state the swap; no persisted notice is added, since the
  plugin's stored data is deliberately narrow.
- **Obsidian's keymap swallows plain `Enter` in some context** → the composer
  listener sits on the textarea, and acceptance exercises trusted keystrokes in
  both a main tab and a sidebar to confirm the event arrives. If a layer claims
  the key first, `defaultPrevented` keeps the message unsent rather than
  half-sending.
- **Stale synchronization state at keypress time** → the guard reads the same
  state that renders the button; if admission is unconfirmed, the text is kept
  for explicit retry, and recovery never replays a prompt.
- **Popover precedence surprises** → completing a reference with `Enter` is
  today's behavior; the second `Enter` sending is stated in the specs for all
  three completion capabilities and covered by a test.

## Migration Plan

No data migration and no stored setting. Rollback is a revert: the binding lives
in the composer's key handling and the two removed scope registrations, with no
service, protocol, or persisted state involved.
