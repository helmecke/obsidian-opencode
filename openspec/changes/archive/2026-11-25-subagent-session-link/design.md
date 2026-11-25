# Design

## Context

See `proposal.md` for motivation. The relevant building blocks already exist and are unchanged by this design:

- A subagent report renders in `src/ui/conversation.ts` (`updateEmbed`) as a hand-built `internal-embed markdown-embed inline-embed is-loaded` frame whose `embed-title` carries the agent and task description. The record's `metadata.childID` is present on live payloads (verified against the local store: it resolves to a `session_v2` row with a `parent_id` and the same vault directory).
- Switching a conversation is `sessions.select(id)` → `synchronization.open()`, both already wired through `ChatView.selectConversation`, including the unsent-draft confirmation.
- `SessionInfo` carries `parentID` (optional, present on children). The switcher list excludes children in `SessionCoordinator.listAt`; the type is already returned and validated.
- Obsidian's own `.markdown-embed-link` rule (absolute top-right anchor, idle opacity, hover background, `--cursor-link`) is already in the host `app.css`; `.markdown-embed` is `position: relative`, so the anchor positions correctly with no plugin CSS.

## Goals / Non-Goals

**Goals:**

- Reuse the host embed-link affordance unchanged (no copied declarations, no custom frame).
- Open the child read-only without ever replacing the parent view with an empty state on failure.
- Keep the switcher contract intact: children stay unlisted, and a child open for reading marks no row as current.

**Non-Goals:**

- No new chat pane or modal; the link switches the current view in place.
- No persistence of the child selection or the parent trail; both are in-memory, consistent with the existing selection model.
- No link on `task` tool entries or anywhere but the report embed.
- No follow-up composition in a child (read-only).

## Decisions

### 1. The link is an icon-only anchor reusing `.markdown-embed-link`

`updateEmbed` appends `<a class="markdown-embed-link" role="button" tabindex="0">` inside the embed frame when `metadata.childID` is a non-empty string. It is labelled **Open subagent session** (`aria-label` + tooltip), carries the host's `maximize-2` icon via `setIcon`, and activates on click, Enter, and Space. Rationale: the class supplies position, sizing, opacity, hover, and theme styling, while the icon matches a native embed link; adding only the behavior keeps the result indistinguishable from a native embed link. The existing `attachLinkRouter` intercepts only `a.internal-link`, so this anchor is untouched by it.

### 2. The renderer emits the child id through a new option

`ConversationOptions` gains `openSubagent?(childID: string): void`; `subagentResult` already reads `metadata`, so it extracts `childID` the same way. The anchor is added in `updateEmbed`, whose body is rebuilt only on signature change, so the link is stable across re-renders. Its listener lives on the anchor node and is discarded with it, matching the renderer's existing listener model (no separate Component needed).

### 3. Opening a child is atomic and never clears the parent

A new `SessionCoordinator.openChild(id)` mirrors `load()` but commits the snapshot only on success: it `session.get`s the child, rejects a missing session or a different directory with a `SessionError`, fetches messages, and only then assigns `this.snapshot`. On any failure the snapshot is untouched, so the parent transcript stays. This avoids the existing `load()` failure path (`unavailable()`), which would otherwise drop the selection and wipe the parent on a stale id. `ChatView.openSubagent` runs the shared draft confirmation first, then `sessions.openChild(id)` → `synchronization.open()`; a `SessionError` shows a Notice and re-renders the unchanged parent.

### 4. Read-only is derived from the selected session's `parentID`

The renderer and composer read `state.snapshot?.selected?.parentID`: a selected session with a `parentID` is a child and renders read-only. User forks carry no `parentID` and stay editable, so no new state flag or persisted setting is needed. `ChatComposer` gains a read-only presentation that hides the input, the whole toolbar (agent, model, variant, send, stop, status, and retry), and the prompt actions, leaving one muted hint centered both ways in the card — *“Subagent session. Continue in <parent title>.”*. The Mod+Enter scope and `send` handler are additionally gated on read-only so a child can never be written to.

### 5. The delegated task is relabelled, not hidden

`ConversationOptions` gains a prompt label (default **You**). The renderer uses it in `entryLabel`, the prompt callout title, and the prompt `aria-label`. `ChatRenderer` supplies **Delegated task** when the selected session is a child. The child's first record — the parent's *“You are a subagent…”* instruction — stays visible because it is the task statement the report depends on.

### 6. The parent breadcrumb is recorded at open time, not fetched

`ChatView` records `{ id, title }` of the session being left when it opens a child, and clears it on any draft or conversation switch. `syncBreadcrumbs()` (called from `refresh`) shows a third crumb — **opencode / sessions / <parent title>** — only while this record exists, and its action calls `selectConversation(parent.id)`. Rationale: the parent is always the session just left, so no extra `session.get` is needed, nested hops work one level at a time (each link records its own parent), and the record's lifetime matches the in-memory selection exactly. Rename is withheld while a child is open by gating `startTitleEdit` and the pane-menu item on the same read-only predicate.

### 7. The composer follows the transcript's measure exactly

The composer is a sibling of the transcript in the view's flex column, so both stretch to the same width. Two host behaviours still shift the inner column: `.markdown-preview-view` reserves a stable scrollbar gutter, and a theme's `--file-line-width` may be `ch`-based, resolving against each element's own font. The composer reserves the same gutter, and in readable-line-width mode it borrows the reading font for its `padding-inline` calculation before restoring the interface font on the card. Rationale: the card then aligns with the transcript text without copying the host's padding or frame rules, and a theme that expresses the measure in `ch` still produces one column.

## Risks / Trade-offs

- **[Stale id between resolve and select]** → `openChild` performs the get and the message load as one committed operation, so there is no resolve-then-select gap; a missing child throws before any snapshot mutation.
- **[Parent title unavailable for a nested child]** → recorded from the session left at click time; no lookup to fail, and a lost record only occurs alongside the (already in-memory-only) lost selection on reload.
- **[Return loses scroll position]** → accepted, matching **Switch conversation…** today; returning reloads the parent and lands at the newest turn.
- **[Read-only predicate depends on `parentID`]** → only delegated children carry it; forks and top-level conversations are unaffected. A future service that hides `parentID` would surface the child as editable, but the current contract returns it.
- **[A theme that restyles `.markdown-embed-link` also affects the plugin]** → intentional: the link is native by construction and should follow the theme.
- **[Accidental write to a child]** → the composer input is not rendered, the send scope is gated, and `send()` early-returns in read-only mode, giving three independent guards.

## Migration Plan

None. No persisted setting, file, or API changes; the child selection and parent trail are in-memory and vanish on reload exactly as the selected conversation does today.

## Open Questions

None.
