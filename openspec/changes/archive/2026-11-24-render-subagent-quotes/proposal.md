# Proposal

## Why

Delegated subagent work reaches the session as `synthetic` records, and the transcript collapses every one of them behind the same **Synthetic note** label. A subagent's report is a real answer that the assistant's own text often relies on, yet the reader has to open a disclosure and read it as unformatted preformatted text. Other injected text — plan-mode reminders, replayed tool output, continuation prompts — shares that label, so the one kind worth reading is indistinguishable from the kind worth hiding.

## What Changes

- Recognize a subagent result as its own transcript record: a `synthetic` message whose `metadata.source` is `"subagent"`, carrying `agent` and `state` in metadata and the task description on the record.
- Render it as a visible native Markdown embed in the reading flow, Markdown-rendered in full at the record's place in the conversation.
- Attribute it with the embed title: the agent, the task description, and `cancelled` only when the result did not complete.
- Strip the record's `<subagent …>…</subagent>` wrapper from the rendered body; take the embed title values from the record.
- Leave every other record kind unchanged: other synthetic text, `system`, `skill`, and unknown types stay collapsed notes; shell and compaction records keep their current presentation.
- Narrow the existing "injected text is never Markdown-rendered" rule to non-subagent records, since a subagent report is model-authored answer content.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: **Quiet transcript notices** changes. Subagent results become visible embedded reports with attribution instead of collapsed injected text; the remaining injected text stays collapsed, and its non-Markdown rule is limited to those records.

## Impact

- `src/ui/conversation.ts`: a new entry kind for subagent results, an embed title, an embed body using the existing Markdown helper, and an accessible label.
- `styles.css`: only the transcript step around the embed; the frame, title type, and padding come from the native embed surface.
- `tests/conversation.test.mjs`: the blanket "no Markdown in injected text" assertion narrows to non-subagent records, with new coverage for recognition, embed title, wrapper stripping, and the unchanged record kinds.
- `openspec/specs/native-chat/spec.md`: updated by the delta spec.
- No API, dependency, persisted-setting, or privacy change: recognition reads only record metadata already delivered and stored.
