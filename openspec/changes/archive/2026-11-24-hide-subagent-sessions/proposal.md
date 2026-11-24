# Proposal

## Why

The service stores every delegated subagent run as a child session at its parent's
location, so the plugin's vault-wide session list includes them. **Switch
conversation…** therefore offers internal, task-titled sessions beside the
conversations the user actually started: in the vault used for this review, 445 of
903 sessions at the vault directory are such children. The switcher exists to
resume a conversation, and a subagent report is already readable where it happened
as the native Markdown embed in its parent transcript.

## What Changes

- The sessions the plugin loads for the current vault keep only its top-level
  conversations: entries with a `parentID` are dropped while loading.
- The switcher, its fuzzy matching, newest-first ordering, and the current-session
  mark stay as they are; only the set they receive narrows.
- Delegated subagent sessions stay out of the list at every depth, and remain
  readable in their parent's transcript as the report embed.
- User forks (which carry no `parentID`) and archived sessions keep their present
  behaviour. Archived sessions are out of scope for this change.
- `session.list` keeps its current request shape (`directory`, `order`, `cursor`);
  the filter stays client-side in the session coordinator.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-management`: **Session switcher presentation** narrows from every
  session belonging to the current vault to its top-level conversations, excluding
  delegated subagent child sessions.

## Impact

- `src/opencode/sessions.ts`: `listAt` skips sessions whose `parentID` is set.
- `tests/sessions.test.mjs` and `tests/session-switcher.test.mjs`: child-session
  fixtures and assertions for the list and the switcher.
- `CHANGELOG.md`: one Unreleased bullet.
- `openspec/specs/session-management/spec.md`: updated by the delta spec.
- `docs/runtime-compatibility.md`: a live check of the switcher against the real
  vault, where child sessions exist.
- No API, dependency, persisted-setting, or privacy change: `parentID` already
  arrives in every `SessionInfo` the plugin validates.
