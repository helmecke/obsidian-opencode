# Design

## Context

See `proposal.md` — Why. Reasoning is a content part of an assistant message:
`SessionReducer` appends and updates it in the in-memory projection, and
`ConversationRenderer` turns it into a collapsed disclosure. Settings are a
plain mutable object created once in `main.ts`; views receive collaborators by
constructor and read the settings object only where needed. There is no settings
event bus, and a settings toggle does not currently notify open views.

## Goals / Non-Goals

**Goals:**

- One persisted boolean whose absence means off, with no data migration.
- Rendering that is identical for live and restored conversations, filtered at
  the last possible point so toggling on can reveal reasoning already received.
- An immediate update of an open transcript when the toggle changes, without a
  reload, reconnect, or conversation reselection.

**Non-Goals:**

- Changing what the service sends, or disabling provider-side reasoning.
- Changing tool activity, notices, footnotes, or the execution status.
- A general settings-notification framework, or new UI beyond one settings row.

## Decisions

### Thread a live getter instead of a copied value

`main.ts` passes `() => settings.showReasoning` through `ChatView` and
`ChatRenderer` into `ConversationOptions`. The renderer reads it at every render
rather than capturing it at construction. A view opened later and a view already
open therefore consult the same current value, and the renderer is never
recreated, so scroll position, expanded disclosures, and Markdown lifetimes are
preserved across a toggle.

Alternative rejected: pass a boolean snapshot and rebuild the view or renderer
on change. That duplicates state and discards view-local state for a
presentation-only change.

### Filter reasoning at render time, not in the reducer

`ConversationRenderer` skips a `reasoning` content part when the getter is false,
before creating its disclosure. The existing key sweep then removes any part
rendered before the toggle. The projection keeps reasoning text, so enabling the
setting later can show reasoning from the same conversation without a snapshot
refresh; disabling removes it from the DOM immediately.

The existing `partKey` for text uses the part's index in `content`, which does
not renumber when reasoning is filtered out, so answer text and tool entries
keep stable identities and are not recreated unnecessarily.

Alternative rejected: drop reasoning in `SessionReducer` or during snapshot
mapping. That makes the visibility decision irreversible for the current
conversation unless the service is re-read, and it couples a display preference
to event reconciliation.

### Notify open views from the settings row

`OpenCodeSettingTab` gains an optional change callback, invoked after the toggle
mutates the settings object and `save()` completes. `main.ts` implements it by
iterating `workspace.getLeavesOfType(CHAT_VIEW_TYPE)` and calling a public
`ChatView.refreshFromSettings()`, which re-renders from the current
synchronization state. No I/O is involved; with no state yet the renderer
refresh is already a no-op.

Alternative rejected: a new event emitter or settings store. One setting does
not justify a second state channel, and the existing save callback is already
the seam between the settings tab and the plugin lifecycle.

### Default and validation

`showReasoning` is stored as `true` only for a literal `true`; every other value,
including a missing key, reads as `false`. `loadSettings` therefore upgrades an
existing install to hidden reasoning, and the existing normalization on save
keeps the persisted shape limited to known fields.

### Ordering inside the assistant part loop

The guard runs before `keys.add(key)` and before part creation. A hidden
reasoning part is absent, not merely collapsed, so its preview text never enters
the DOM. Streaming updates continue to arrive in the projection; the next render
after a delta skips them again, or recreates the disclosure with the accumulated
text if the setting was enabled in the meantime.

## Risks / Trade-offs

- **Reasoning stays in memory while hidden** → It is transient client state only,
  never persisted, and the setting controls display rather than transport.
- **A toggle only refreshes open chat views** → Views created later read the
  same getter, so no additional propagation path is needed.
- **Disabled reasoning cannot be read without turning the setting on** → That is
  the intended behavior; the user can enable it and see the accumulated text
  without reconnecting.
- **Downgrading the plugin drops the stored key** → Older versions ignore and
  then drop the unknown field on save; they return to always showing reasoning,
  which is their documented behavior.

## Migration Plan

No data migration. Ship with the normal build and release. Existing settings
data without `showReasoning` reads as off; rollback loses only the preference and
restores the previous always-shown rendering.
