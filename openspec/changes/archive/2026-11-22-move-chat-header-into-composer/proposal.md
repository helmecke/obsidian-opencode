# Proposal

## Why

The chat view still spends two fixed rows at the top on a title/status/Retry
strip and a separate conversation bar, even though the controls that belong to
the conversation now live in the composer card at the bottom. In a sidebar those
rows consume space that the transcript needs, and conversation state is split
from the place where the user acts on it. Folding the header into the composer
card completes the consolidation started by the unified composer change.

## What Changes

- Remove the separate view header and conversation bar. The **OpenCode** title is
  dropped from the view body because the pane tab already names the view.
- Move connection/execution status, **Retry discovery**, the **Conversation**
  selector, and **New conversation** into the composer's bottom toolbar,
  left-aligned beside the **Agent**, **Model**, and **Send** controls.
- Render **New conversation** and **Retry discovery** as icon buttons with
  tooltips and accessible names, and drop the Conversation selector's visible
  label, so the toolbar stays narrow in a sidebar.
- Keep the existing status texts, retry enablement rules, conversation list
  contents, disabled states, and handlers unchanged; only their location and
  styling change.
- Style the toolbar's meta group with the theme's muted text, compact icons, and
  pill select so it does not compete with the message field, and let it wrap in
  narrow sidebars without hiding the status.
- Preserve the message field, stop/agent/model/send controls, uncertain-send
  recovery strip, keyboard shortcuts, and accessible names.
- Do NOT add conversation tabs, inline renaming, or other new conversation
  features. The selector and button keep their current behavior.
- **BREAKING**: none; no commands, server calls, persistence, or protocol change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: the unified composer region now also owns the conversation
  selector, new-conversation action, connection/execution status, and discovery
  retry affordance; the view no longer renders a separate header.

## Impact

- `src/ui/chat-composer.ts`: create the meta container inside the toolbar's
  start group and expose the elements the renderer populates.
- `src/ui/chat-renderer.ts`: stop building `.opencode-chat-header` and
  `.opencode-chat-conversations`; create status, retry icon, conversation
  selector, and new-conversation icon in the toolbar meta group with `setIcon`,
  and keep their update logic and public getters.
- `styles.css`: remove header and conversation-bar rules; add toolbar meta,
  icon-button, compact select, and status styles including narrow-sidebar
  wrapping.
- `tests/plugin-shell.test.mjs`: assert the controls are inside the composer
  toolbar, the old header rows are gone, icon actions expose accessible names,
  and status/retry/conversation behavior still works.
- `README.md`: describe the consolidated composer toolbar and its icon actions.
