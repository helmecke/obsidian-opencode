# Design

## Context

See `proposal.md` for motivation and `specs/native-chat/spec.md` for the behavior contract.

The transcript renderer (`src/ui/conversation.ts`) is message-scoped. Each assistant message is one `Entry`; its content parts are created once, keyed by tool id or part index, and appended to the message body in order. Tool parts render through `ToolEntryView` (`src/ui/tool-entry.ts`) as native `<details>` rows. The existing disclosure pattern already provides the icon-at-rest, chevron-on-hover summary and the native keyboard behavior this change needs.

Every assistant message carries `time.completed`, `finish`, a model/agent and an optional `snapshot.files`. A turn can contain several assistant messages, one per model step; the renderer already treats a contiguous assistant run as one turn for footnotes and the changed-files disclosure. The change deliberately stays inside one message, so no turn model is introduced.

Tool parts carry a name, input and a state with generic `metadata`. OpenCode 2's `edit` and `patch` metadata contains structured file diffs (`filediff` or `files[]` with `additions`, `deletions`, `patch`); `write` may report only the target path. The plugin does not currently read those fields. The existing trailing changed-files disclosure remains the authoritative, per-file review surface and is not changed.

## Goals / Non-Goals

**Goals:**

- Make one assistant message read as a few phase groups without changing its message entry, footnote, changed-files disclosure or tool-row detail.
- Keep tool and reasoning DOM stable across streamed updates, group growth and absorption of look-ups, so focus, selection and scroll survive.
- Show a useful summary line from the data already in the message; never wait on a network request to render a group.
- Reuse native `<details>`/`<summary>` and theme variables; add no setting and persist nothing.

**Non-Goals:**

- Merging same-phase groups across assistant messages, or folding superseded replies. Both need a turn model and are a later change.
- Collapsed / Grouped / Expanded modes, a live-preview setting, or a per-row stop action.
- Humanising tool names beyond the group line.
- Moving the changed-files review surface into a group.

## Decisions

### A pure grouping module

`src/ui/activity-groups.ts` takes an ordered list of visible parts plus a `live` flag and returns groups: phase, parts, drawn-row count, and whether the group needs a header. It contains no DOM. This mirrors the renderer's existing part model and lets the classification, absorption, count and summary rules be tested directly.

Phase classification follows OpenChamber, with aliases for the names the service actually sends:

| Phase | Tools |
| --- | --- |
| explore | `read`, `grep`, `glob`, `list`, `skill`, `lsp`, `codesearch`, `webfetch`, `websearch` |
| edit | `edit`, `multiedit`, `write`, `patch` |
| run | `shell`, `bash` |
| other | every remaining tool; it joins the neighbouring phase group |

`task` and `subagent` (delegation) and `question` are standalone: they never enter a group and split the run around them. `todowrite`/`todoread` join neighbours but are not counted. Names are normalised by lowercasing, stripping a known provider namespace and accepting the aliases above; an unknown tool is treated as `other` and counted as a command, because it acts.

Group building mirrors OpenChamber's `segmentActivity`:

1. Walk the parts. A reasoning part joins the open group or waits for one; text, a standalone tool and any non-tool part end the group.
2. A tool with a phase starts a run; an `other` tool joins the previous run.
3. Merge adjacent runs of the same phase.
4. Absorb a run of at most five explore calls into the adjacent edit or run: carried before an edit, appended after an edit or run when it is not the still-growing live tail.
5. Merge again, then compute each group's phase (edit if files changed, else run if commands, else explore, else other) and its drawn-row count.

A group with one drawn row is rendered as the tool or reasoning row itself; only groups with two or more drawn rows get a container and a line.

### Summary data without a request

The group line is computed from the group's own parts:

- **Files changed**: unique normalised paths named by completed `edit`/`write`/`patch` calls, from metadata `filediff`/`files[]` or fallback input paths. Additions/deletions are summed from metadata patches or counts. If any changed file lacks a complete count, the line omits `+A −D` and keeps the file count.
- **Failed**: tool states with `status: 'error'`.
- **Commands run**: counted calls that act, excluding file changes, explore, uncounted note/question calls and standalone calls.
- **Files read**: unique paths named by `read` calls; when an explore group names none, the line says `explored`.
- **Web**: a web tool adds `searched the web`.
- **Fallback**: a group with calls but no counted label says `N steps`.
- **Order**: files changed, failed, commands run, files read, explored, searched the web, matching the reference.

Counts cover the whole group, including rows hidden by the live window. Duplicate edits of one file count once and sum their per-call stats; the trailing changed-files disclosure remains the authoritative total, so the two may differ when edits overlap.

### Rendering groups over stable part views

`ConversationRenderer` keeps every tool and reasoning view in `entry.parts` as it does now, but stops appending part roots straight to the body. Each render computes the groups, then reconciles group containers:

- A group container is a native `<details class="opencode-activity-group">` with a `<summary>` carrying the phase icon, the line text and the existing disclosure affordance, plus a body div for its rows. A multi-row group is closed unless it is the live group or the user opened it.
- A one-row group has no container of its own; its part root sits directly in the message body.
- Existing containers are matched to new groups by part-id overlap, not by their first part, so absorbing a look-up run or merging a neighbour reuses the container and preserves open state. Unmatched containers are disposed; new ones are created.
- Part roots are moved into their target body with `appendChild` in order. Moving a node keeps its listeners, focus and scroll position; the view objects are never recreated just because the group changed.
- The live window detaches all but the last seven nested rows of the newest group into a document fragment. Counts still include them. When the group settles, the fragment's rows are reattached and the group folds or stays open according to the user's state.

Group open state lives in `ConversationRenderer` as `Map<groupKey, boolean>` keyed by a stable member id. A group with no explicit entry is open while it is the live group and closed once the message completes. An explicit entry wins.

### Live window and reading

`ChatRenderer` already owns the transcript's scroll container. It passes a `reading` predicate into the conversation renderer: true when the transcript is more than 80 px from the bottom or focus is inside the live group. While `reading` is true, the live window keeps its current slice instead of advancing; when the reader returns to the bottom and focus leaves, it advances to the newest seven rows. No auto-scroll is added: the existing near-bottom behavior stays.

### Accessibility, styling and failure

The group summary is a native `<summary>`, so it is keyboard focusable, expands with Enter or Space, and reports its state. The icon is decorative; the visible summary is the accessible name. `styles.css` adds scoped classes for the group line, nested indent and tight row spacing, using theme variables only. A failure count uses `--text-error`; the group does not auto-open.

## Risks / Trade-offs

- **Group identity changes while streaming** → reconcile containers by part-id overlap; never key by the first part, which changes when look-ups are absorbed.
- **Trimming rows moves the reader** → pause the window while scrolled away or focused inside; only advance near the bottom; detach rather than dispose rows.
- **One group per model step** → a long turn can still show several groups, because messages are not merged. This is the accepted cost of keeping the current renderer and its footnotes/changed-files ownership; cross-message merging is a later change.
- **Per-call diff stats can be incomplete** → omit `+A −D` for the whole group when any file lacks complete counts; the trailing disclosure remains authoritative.
- **Tool-name variants** → a normalisation table with aliases, plus tests for `bash`/`shell`, `task`/`subagent`, namespaced MCP tools and unknown names.
- **Metadata can be large** → read only paths, counts and patch headers from `metadata`; never retain before/after snapshots or render them in the summary.

## Migration Plan

No data or settings migration. Existing sessions render with groups on the next render; a rollback is a code revert. The change adds no network calls and no persisted state. Apply order: grouping module and tests, renderer integration, styles, documentation, then the full `npm test`, `npm run build`, `npm run lint` and a live acceptance run in the disposable vault.
