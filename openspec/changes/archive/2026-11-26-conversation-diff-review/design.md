# Design

## Context

See `proposal.md` — Why. The plugin is a native client for a local OpenCode 2
service and never owns execution: it renders the transcript, gates writes only
through OpenCode's permission cards, and persists nothing but a few settings.
Today the assistant renderer (`src/ui/conversation.ts`) turns each assistant
content part into a Markdown block or a `ToolEntryView`, showing raw tool input
(`src/ui/tool-entry.ts`) but no aggregate view of file changes.

The generated client (`@opencode/client` 2.2.2, already bundled) exposes
`client.session.diff({ sessionID, from?, to? })` returning
`FileDiffInfo[]` (`file`, `patch`, `additions`, `deletions`, `status`,
`more?`). Each assistant message carries `snapshot?: { start?, end?,
files? }`, so a turn-scoped diff and a conversation-scoped diff are both
addressable without new endpoints. `ConnectionCoordinator.connect()` returns the
client; `SessionCoordinator` owns the in-memory `SessionSnapshot` whose
`messages` preserve these fields verbatim.

## Goals / Non-Goals

**Goals:**

- A read-only changed-files view: per-turn disclosure plus a session review,
  driven entirely by the server's own diff data.
- Lazy loading with an in-memory, per-view cache; nothing persisted.
- Degradation that is local to the review surface and never affects chat,
  execution, permissions, or the connection.

**Non-Goals:**

- Pre-approval preview, per-hunk accept/decline, reverting, or any write path.
- A required compatibility contract for `session.diff`.
- Changing the permission cards, tool entries, or the `native-chat` transcript
  typography.
- Cross-session or persisted change history.

## Decisions

### Diff accessor behind the existing client seam

A small module in `src/opencode/` wraps `client.session.diff`, mapping a missing
session and transport failures to the existing error types and leaving
validation to `api-contract.ts`. It never writes credentials or registration.
No new dependency; the endpoint is already generated.

Alternative rejected: calling the promise client directly from the view. That
scatters error handling and bypasses the contract/validation seams the rest of
the plugin relies on.

### Two bounded calls, no polling

`session.diff` takes `from`/`to` as **user-message IDs** (the service rejects
snapshot IDs). The turn disclosure requests
`session.diff({ sessionID, from: promptID, to: promptID })` using the user prompt
that produced that assistant turn. The session review requests one call bounded
from the first user prompt to the last; when there is no prompt it falls back to
an unbounded call and labels the result as the conversation's changes. Nothing
is fetched in the background; both surfaces are lazy.

Alternative rejected: eager per-turn calls to precompute counts. That adds a
request per completed turn and a catch-up burst on reopening a long
conversation, for counts the collapsed row does not need.

### Per-view in-memory cache

A `Map` keyed by `sessionID|from|to` holds parsed results for the view's
lifetime; it is discarded on view close or conversation switch. The session
review always re-requests on open rather than trusting the cache, so it reflects
the current server state after further turns.

Alternative rejected: caching in `SessionCoordinator` or plugin state. That
survives views it should not, and any persistent form would violate the
never-persist-vault-contents invariant.

### Turn disclosure as a trailing assistant part

`ConversationRenderer` gains a changed-files part appended after the assistant's
content parts, rendered only when `assistant.snapshot.files` is non-empty. It
reuses the disclosure pattern (muted icon, chevron on hover/focus, collapsed by
default) so it reads as supporting detail under `native-chat`. Expansion
triggers the lazy fetch and populates the file list; the part keeps a stable key
so streaming and re-renders do not recreate it.

Alternative rejected: a separate message entry or a fixed footer. A footer
competes with the composer/status surfaces; a separate entry loses the turn
association the snapshot provides.

### Unified-diff parser as a pure function

A pure `parsePatch(patch)` splits the server's patch into hunks and lines,
classifying added, removed, and context lines. A small renderer emits rows with
theme variables (`--color-green`/`--color-red` for add/remove, a muted token
for context), `white-space: pre-wrap` with a hanging indent so long single-line
paragraphs wrap without horizontal scrolling, and `tab-size` preserved. Only the
expanded file is parsed; a single rendered patch is capped (default 200k
characters) with a **Show full patch** control, and `more: true` adds a partial
label.

Alternative rejected: rendering the raw patch string, or using a diff library.
Raw text is unreadable in the reading column, and a library adds a dependency
for a well-defined `+`/`-`/`@@` grammar the server already produces.

### Session review as a native Modal

A `SessionDiffReviewModal` extends Obsidian's `Modal`, opened from a new
document-menu item and a command (`Review changes in this conversation`). It
shows the flat per-file list with counts, expands per file, and offers open and
copy actions. Open reuses the existing link-open behavior; copy uses
`navigator.clipboard` on the patch string and never reads the clipboard.

Alternative rejected: an inline section at the end of the transcript. It would
grow unboundedly and duplicate the per-turn disclosures; the document menu is
where conversation controls already live.

### Failure isolation at the surface

A failed fetch sets a local error state on that disclosure or the modal,
rendering a compact message with **Retry**. It writes nothing to the composer
status, the connection status, or the reducer, and it never adds
`session.diff` to the required contract, so an older service simply loses this
read-only surface rather than failing compatibility.

## Risks / Trade-offs

- **A turn without a preceding user prompt** → The disclosure then falls back to
  an unbounded call and labels the result as the conversation's changes; both
  surfaces keep their open/copy actions where the file exists. Verified live
  before archive.
- **`snapshot.files` may be empty on some write paths (shell, outside vault)** →
  A missed row is a false negative, not an error; live acceptance records which
  paths populate it, and a wider trigger is a follow-up decision, not a silent
  guess.
- **A single pathological patch can be very large** → Per-file lazy render plus
  the cap bounds cost; the full patch remains available via copy without full
  render.
- **Outside-vault and deleted files can only be named, not opened** → That is
  intentional and stated in the spec; the path is shown rather than hidden.
- **The diff reflects server truth, not the plugin's own bookkeeping** → This is
  the point: no separate change store to drift or to leak into plugin data.

## Migration Plan

No data or settings migration. The feature is additive and read-only; an older
build simply lacks it. Rollback removes the surface and changes no stored data.

## Open Questions

None. The two live-behavior checks above are verification tasks recorded in
`docs/runtime-compatibility.md`, not decisions that change the spec or the task
breakdown.
