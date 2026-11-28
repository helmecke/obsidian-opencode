# Tasks

## 1. Grouping model

- [ ] 1.1 Add `src/ui/activity-groups.ts` with tool-name normalisation, the explore/edit/run/other classification, standalone delegation/question handling and the uncounted note tools. Verify with a new `tests/activity-groups.test.mjs` covering `bash`/`shell`, `task`/`subagent`, namespaced MCP names and unknown tools.
- [ ] 1.2 Build contiguous runs from an assistant message's visible parts, merge same-phase neighbours, and absorb up to five look-ups before an edit or after an edit/run; keep text, standalone calls and non-tool parts as breaks. Verify the run shapes and absorption cases in `tests/activity-groups.test.mjs`.
- [ ] 1.3 Compute each group's phase, drawn-row count, unique files changed, `+A −D` totals from edit/patch metadata, failed count, commands, unique files read, `explored`, `searched the web` and the `N steps` fallback. Verify singular/plural lines, one-row groups and incomplete-diff omission in `tests/activity-groups.test.mjs`.

## 2. Conversation rendering

- [ ] 2.1 Render multi-row groups as native `opencode-activity-group` disclosures whose bodies hold the existing tool and reasoning roots; move roots rather than recreating views and match groups to containers by part-id overlap. Verify in `tests/conversation.test.mjs` that a streamed update preserves row identity, order, listeners and an open group.
- [ ] 2.2 Render one-row groups as the bare tool or reasoning row, add the phase icon at rest and chevron on hover/focus/open, and keep the summary as the accessible name. Verify the DOM and labels in `tests/conversation.test.mjs`, and add the class assertions to `tests/style-contract.test.mjs`.
- [ ] 2.3 Keep the newest group of an unfinished assistant message open with its last seven nested rows, pause the window while reading, fold on completion unless the user opened it, and expose every row after settling. Verify the live, paused, settled and user-opened cases in `tests/conversation.test.mjs`.
- [ ] 2.4 Pass the transcript's reading state from `ChatRenderer` into the conversation renderer, using the existing near-bottom threshold and focus inside the live group. Verify in `tests/chat-renderer.test.mjs` that scrolling away holds the window and returning advances it.
- [ ] 2.5 Keep failed calls counted in the group line in the error colour, leave the group folded, and retain each failed row's error detail. Verify the line, the error state and the absence of auto-open in `tests/conversation.test.mjs`.
- [ ] 2.6 Join reasoning to an open group and keep delegation, questions and text as boundaries. Verify with `Show reasoning` on and off in `tests/conversation.test.mjs`, including a group that becomes a bare row when reasoning is hidden.

## 3. Styling

- [ ] 3.1 Add scoped group-line, nested indent, tight row spacing and error-colour rules to `styles.css`, using theme variables only. Verify `tests/style-contract.test.mjs` covers the new classes and rejects colour literals, `!important` and unscoped selectors.

## 4. Documentation

- [ ] 4.1 Update the **Show reasoning** setting description in `src/settings.ts` to say a thought can join an activity group, and verify the settings copy test in `tests/settings.test.mjs`.
- [ ] 4.2 Update the README's tool-activity section to describe phase groups, the summary line, the live window and the fold behaviour; verify each statement against the implemented view. Keep internals out of the README.

## 5. Verification

- [ ] 5.1 Run `npm test`, `npm run build` and `npm run lint`; all pass with no new warnings.
- [ ] 5.2 In a disposable vault, run a turn with reads, edits, shell calls and a failure; confirm the groups, counts, live seven-row window, pause on scroll, settle behavior, failure line, tool details and the unchanged changed-files disclosure. Append the evidence and any limitation to `docs/runtime-compatibility.md`.

## Workflow follow-up

- The plan PR is opened by the planning run and awaits approval.
- Start implementation only from a separate apply run after the plan is approved.
- Archive the change on `openspec/grouped-tool-activity` after review and merge.
