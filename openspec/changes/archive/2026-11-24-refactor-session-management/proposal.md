# Proposal

## Why

Conversation management today is squeezed into the composer toolbar and the plugin always resumes the last saved conversation. This refactor makes a chat session behave like a first-class Obsidian document: opening chat starts a fresh conversation, the session name is shown and renamed where a note's title lives, and switching conversations moves to the document options menu with a quick-switcher-style picker.

## What Changes

- **New conversation draft on open**: opening chat with no chat view open starts a local new-conversation draft. Opening chat when a chat view already exists reveals it without starting another draft. The OpenCode session is created only when the first message is sent, with the draft's local title if one was set. Every chat view shares one global selected session or draft.
- **No auto-resume**: the plugin stops restoring the last selected session. Resuming a prior conversation happens only through the new session switcher. The saved `selectedSession` setting is removed.
- **Draft defaults**: a draft's agent, model, and thinking controls show the configured default agent and model, reuse the last selected model when the default agent has no model, and remain editable; the choices are applied when the first message creates the session.
- **Session title in the chrome**: the pane header and workspace tab show the current session or draft title. The header uses Obsidian's native breadcrumb trail (**opencode / sessions / title**): **opencode** starts a new draft, **sessions** opens the switcher, and the title is the rename surface. An untitled session or draft shows **New conversation**, and the parent breadcrumbs collapse while editing.
- **Rename in place**: clicking the header title edits it inline, like a note's inline title, and a **Rename conversation…** menu item is added. Renames write to the server for selected sessions, while a draft name stays local until the first message creates the session. External renames update live.
- **Session switcher in the menu**: the conversation dropdown and new-conversation icon are removed from the composer. The document **⋯** menu gains **Switch conversation…**, **New conversation**, and **Rename conversation…**; the same items appear on the tab's right-click menu. The switcher is an Obsidian fuzzy suggestion modal over this vault's sessions.
- **Safe switching**: switching is allowed while the current session is executing (the server keeps running), closing the view never interrupts execution, and switching with unsent composer text prompts before discarding it.

## Capabilities

### New Capabilities

- `session-management`: creating, switching, renaming, and titling conversations, including opening behavior and resume-through-switcher semantics.

### Modified Capabilities

- `native-chat`: the conversation selector and new-conversation action move out of the composer into the document menu, and the previous restore-last-selected behavior is removed in favor of the session-management selection model.

## Impact

- `src/ui/chat-view.ts`, `src/ui/chat-renderer.ts`, `src/ui/chat-composer.ts`, `src/ui/session-switcher.ts`: title and breadcrumb chrome, inline rename, menu and switcher wiring, composer cleanup, draft defaults.
- `src/opencode/sessions.ts`: add `rename`, remove `selectedSession` persistence, keep the local draft title/agent/model, and materialize the session on first send; keep `list`/`select` for the switcher.
- `src/opencode/api-contract.ts`: wrap `session.update` for rename so contract failures are translated consistently.
- `src/settings.ts`: remove `selectedSession` and its validation; persist the last selected model and variant.
- `src/main.ts`, `src/ui/chat-view.ts`: start a client-side draft on first open and wire draft preferences.
- `src/state/synchronization*.ts`: resolve draft defaults, materialize the draft on first send, and handle `session.renamed`/`session.deleted` as non-transcript mutations.
- `styles.css`: header title and breadcrumb affordances and removed composer meta rules.
- `README.md`, `docs/architecture.md`, `docs/client-contract-review.md`: user guide, persistence/chrome notes, and contract notes.
- Tests in `tests/` for sessions, settings, synchronization, chat renderer/view, the switcher, and the plugin shell.
