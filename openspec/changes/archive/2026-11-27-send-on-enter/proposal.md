# Proposal

## Why

The composer is the plugin's main surface, yet its most frequent action needs a
three-key chord: `Enter` inserts a newline and only `Ctrl/Cmd+Enter` sends. Every
other chat composer sends on `Enter`, so the current binding fights muscle
memory and spends a modifier on the action users perform most often.

## What Changes

- `Enter` (no modifiers) sends the message. `Shift+Enter` is the way to add a
  line. **BREAKING** for anyone used to the chord: `Ctrl/Cmd+Enter` no longer
  sends and now behaves like the textarea's own newline.
- `Enter` acts only when the send control is enabled. In every other state —
  execution running, prompt awaiting confirmation, interaction busy, not
  connected, empty or whitespace-only text — the key does nothing and inserts no
  newline.
- While a completion popover is open, `Enter` keeps inserting the highlighted
  row. Selection completes the reference and closes the popover; the next
  `Enter` sends.
- An `Enter` that confirms an IME composition, and an auto-repeated `Enter`, do
  not send.
- Both `Mod+Enter` registrations are removed: the view-local scope in the chat
  view and the completion popover's own scope. The popover no longer needs a
  send callback.
- The placeholder drops its key hint and reads "Plan, build, or ask."; the keys
  are documented in the README and named in the CHANGELOG.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: adds the composer's sending keys, including the states in which
  `Enter` is inert and the precedence of an open completion popover.
- `composer-note-linking`: its keyboard requirement currently promises that
  `Ctrl/Cmd+Enter` still sends while the popover is open, which is no longer
  true.
- `composer-skill-mentions`: same promise and the same correction.
- `composer-slash-commands`: same promise and the same correction.

## Impact

- `src/ui/chat-composer.ts` — sends on plain `Enter`, with composition, repeat,
  and send-state guards.
- `src/ui/chat-renderer.ts` — drops the view-local `Mod+Enter` registration.
- `src/ui/composer-suggest.ts` — drops the popover's `Mod+Enter` handler and its
  send callback.
- `tests/chat-composer.test.mjs`, `tests/composer-suggest.test.mjs` — cover the
  new binding, the inert states, and the popover precedence.
- `README.md`, `CHANGELOG.md` — user-facing description of the keys.
- `docs/runtime-compatibility.md` — new live evidence for the binding.
- No service, protocol, endpoint, or persisted-setting change.
