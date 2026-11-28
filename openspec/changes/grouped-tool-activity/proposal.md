# Proposal

## Why

A long turn currently reads as a stack of near-identical tool disclosures: each read, search, command and edit gets its own row, so the shape of the work — explore, then edit, then run — disappears. OpenChamber's grouped activity turns the same turn into a few phase lines with counts, which is easier to scan and leaves the answer in front. The plugin should adapt that structure to its native transcript without adding a display mode.

## What Changes

- Group the tool activity of each assistant message into contiguous phase runs: explore, edit, run and other. Apply OpenChamber's rule: same-phase neighbours merge, up to five look-ups fold into the edit that follows or the edit/run that precedes, a larger explore run stands alone, and text always breaks a group.
- Render a group as one collapsed disclosure when it contains more than one drawn row. Its line names what the group did: files changed with `+A −D`, failed calls, commands run, files read, `explored`, and `searched the web`, falling back to `N steps`. Count unique files; omit the `+A −D` totals when a call's diff data is incomplete rather than show a wrong sum.
- Keep a group of one drawn row as the existing bare tool row, live or finished, so no header appears only to vanish when the call completes.
- Give each phase line its own leading icon: `search`, `file-diff`, `terminal` and `wrench`. Keep the existing fold affordance — icon at rest, chevron on hover, focus or open.
- Keep the live group open until its assistant message finishes, showing its last seven nested rows. Pause the window while the reader is scrolled away from the bottom or focused inside the group. On finish, fold the group unless the reader opened it.
- Let reasoning join an open group; keep delegation (`task`/`subagent`) and questions outside groups so neither disappears into a summary.
- Count failed calls in the error colour while leaving the group folded. Keep every tool row's status, duration, input/result disclosure and the trailing changed-files disclosure unchanged.
- Add no setting: grouping is the transcript shape. Update the **Show reasoning** description because a thought can now sit inside a group.
- Update the native-chat contract and its tests, scoped styles, and the user-facing note about tool activity.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: the **Document-like transcript** requirement gains grouped tool activity and its fold behaviour, and the **Reasoning visibility setting** requirement now allows a reasoning row to join an activity group. New requirements in the same capability cover phase formation, the summary line, the live window, failures, and the group boundary around reasoning and standalone calls.

## Impact

- `src/ui/activity-groups.ts` (new): phase classification, run building, look-up absorption, counts and summary text.
- `src/ui/conversation.ts`: group containers, stable tool-row lifetimes, live window and fold state.
- `src/ui/tool-entry.ts`: expose per-call file and diff facts used by the group summary, without changing the row's own presentation.
- `styles.css`: scoped group line, nested rows and indent; theme variables only.
- `tests/conversation.test.mjs`, a new `tests/activity-groups.test.mjs`, and `tests/style-contract.test.mjs`: grouping, counts, live window, fold state, accessibility and style coverage.
- `README.md` and `docs/runtime-compatibility.md`: the user-facing transcript shape and live acceptance evidence.
- No client-contract, settings-schema, persisted-data or dependency changes.
