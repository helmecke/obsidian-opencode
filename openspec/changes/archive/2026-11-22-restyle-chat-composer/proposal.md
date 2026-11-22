# Proposal

## Why

The current composer is a plain textarea with a text **Send** button, while the
agent and model selectors live in the view header. This splits the controls that
belong to composing a message and looks noticeably more utilitarian than
OpenChamber, the client the user already uses. The user wants the Obsidian chat
composer to match OpenChamber's single rounded card with an integrated control
toolbar.

## What Changes

- Replace the stacked textarea-and-button composer with one rounded, theme-aware
  card matching OpenChamber's visual structure: the message field on top, a
  control row beneath it.
- Move the **Agent** and **Model** selectors from the chat header into the
  composer's control row, presented as compact labelled controls in the
  OpenChamber style instead of full-width form selects.
- Replace the text **Send** button with a circular icon button (arrow-up) on the
  right of the control row; replace the header **Stop** button with an
  icon button shown in the composer only while execution is running.
- Use a concise OpenChamber-style placeholder that describes only features this
  plugin supports; do not advertise `@`, `$`, `/`, attachments, or voice.
- Keep the existing uncertain-send recovery strip, disabled states, keyboard
  shortcuts, and accessible names; place recovery actions in or directly above
  the card.
- Do NOT add new capabilities: no attach button, shield, microphone, command or
  skill pickers, and no decorative or permanently disabled icons. The chat
  header, conversation selector, and message rendering stay unchanged.
- **BREAKING**: none; all existing commands, state handling, and server calls
  keep their behavior.

## Capabilities

### New Capabilities

None. This is a presentation change to an existing capability.

### Modified Capabilities

- `native-chat`: adds a requirement for a unified composer region that holds the
  message input and its related controls, stays usable in narrow layouts, and
  exposes no inert controls. Existing composition, selection, and interruption
  requirements continue to apply.

## Impact

- `src/ui/chat-composer.ts`: new card structure, toolbar, icon send/stop
  controls, agent/model placement, placeholder, and disabled-state handling.
- `src/ui/chat-renderer.ts`: builds selectors in the composer instead of the
  header, wires stop/agent/model events from the new location, and drops the old
  header controls.
- `src/ui/chat-options.ts`: may need display formatting for compact model and
  agent labels/pills.
- `styles.css`: composer card, toolbar, icon buttons, compact selectors,
  focus/hover/disabled states, and narrow-sidebar wrapping.
- `tests/plugin-shell.test.mjs`: existing DOM assertions for header selectors and
  composer controls must move to the new structure without weakening coverage.
- `README.md`: describe the new composer layout and where agent/model/stop now
  live. No API, dependency, persistence, or protocol changes.
