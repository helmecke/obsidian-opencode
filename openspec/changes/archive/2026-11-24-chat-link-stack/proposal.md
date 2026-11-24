# Proposal

## Why

Vault links in chat answers currently ignore every mouse modifier and always open a new tab, because `attachLinkRouter` swallows the event and calls `openLinkText(..., true)`. That discards Obsidian's own modifier contract (new tab, new tab group, new window) and gives the user no way to collect the documents a conversation references. This change restores native modifier semantics and adds one sticky note group beside the chat that later links reuse.

## What Changes

- Chat link navigation honours Obsidian's modifier contract instead of forcing a new tab:
  - click → navigate an existing note tab, preferring one outside the chat's group, or add a tab to the chat's group if none exists
  - Cmd/Ctrl+click → new tab in the chat's current tab group, not a new split or the last focused group
  - Cmd/Ctrl+Alt+click → the chat's note group: created to the right on first use, appended afterwards, focused if the note is already there
  - Cmd/Ctrl+Alt+Shift+click → native new window
  - middle click → new tab in the chat's group (same as Cmd/Ctrl)
- Adds a per-chat-tab note group owned by the view, remembered in memory only (a restart starts a fresh group).
- Duplicate links resolve to the existing tab (heading/block subpath applied) instead of adding a second copy.
- Unresolved links keep today's non-destructive behaviour: a notice, no file, no group.
- Documents the one-time **Stack notes** toggle and records the `focusNewTab` limitation.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `vault-link-navigation`: link activation in chat answers now follows Obsidian's modifier semantics and may target a sticky note group beside the chat, instead of always opening a new non-chat tab.

## Impact

- `src/ui/markdown.ts` — router derives the destination from the pointer event and keeps the unresolved-link guard.
- `src/ui/chat-renderer.ts` — `LinkEnvironment.open` gains the pointer's pane type; the renderer routes to a note tab, the chat's split, or the sticky note group.
- `src/ui/chat-view.ts` — holds one note group per view instance.
- New `src/ui/link-stack.ts` — create, append, dedupe by file, apply subpath, reserved note-tab selection, and focus-rule logic.
- `README.md`, `docs/runtime-compatibility.md` — user-facing Stack-notes tip and the `vault.getConfig('focusNewTab')` limitation.
- No dependency or API-contract changes on the OpenCode service side.
