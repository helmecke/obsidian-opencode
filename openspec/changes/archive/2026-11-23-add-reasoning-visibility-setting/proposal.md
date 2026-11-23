# Proposal

## Why

Reasoning is currently always rendered as a collapsed transcript row with a
one-line preview. That adds a line of model-internal text to every answer and
reveals the opening of that text before the user has chosen to see it. The user
wants showing reasoning to be an explicit setting, off by default, so the
transcript stays quiet unless reasoning is requested.

## What Changes

- Add an OpenCode setting **Show reasoning** that is off by default and persists
  with the existing plugin data.
- When the setting is off, the transcript omits reasoning parts entirely: no
  summary row, icon, preview, or body, for live and restored conversations
  alike. Answer text, tool activity, footnotes, notices, and execution status
  keep their current behavior.
- When the setting is on, reasoning keeps today's presentation: a collapsed
  disclosure with a muted icon, the name, a one-line preview, and the full
  Markdown body on expansion.
- Re-render an open chat view when the setting is toggled, so the change takes
  effect without reloading the plugin or reopening the view.
- Document the setting in the README and add a CHANGELOG entry.
- **BREAKING**: none. Stored data gains one optional boolean, read as `false`
  for existing installs.

## Capabilities

### New Capabilities

None. Visibility of reasoning in the existing transcript is a `native-chat`
behavior.

### Modified Capabilities

- `native-chat`: reasoning visibility becomes user-controlled and hidden by
  default. The existing supporting-detail requirement is narrowed so only tool
  activity is always shown as a collapsed disclosure, while reasoning appears
  as one when the setting is enabled. A new requirement covers the setting,
  its default, and live re-rendering.

## Impact

- `src/settings.ts`: new `showReasoning` field, default and validation, and the
  settings-row toggle.
- `src/main.ts`: supply the current value to the chat view and refresh open
  views when the setting changes.
- `src/ui/chat-view.ts`, `src/ui/chat-renderer.ts`, `src/ui/conversation.ts`:
  pass the value to the renderer and skip reasoning parts while disabled.
- `tests/conversation.test.mjs` and a settings test: cover the default, the
  opt-in rendering, and removal of already-rendered reasoning on toggle.
- `README.md`, `CHANGELOG.md`: document the setting and its default.
- No protocol, dependency, credential, or persistence-shape change beyond the
  added optional boolean. Reasoning still arrives from the service; it is only
  not rendered.
