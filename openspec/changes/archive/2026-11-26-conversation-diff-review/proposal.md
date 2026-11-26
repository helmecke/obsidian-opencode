# Proposal

## Why

The transcript shows raw tool input but no readable record of what an agent
changed in the vault, so a user cannot review edits after the fact without
opening each file. OpenCode already exposes authoritative per-file diffs
(`session.diff` returning `FileDiffInfo` with patch and counts, bounded by user
message IDs, plus each assistant turn's `snapshot.files`), so the plugin can
present that record without touching execution.

## What Changes

- Add a per-turn changed-files disclosure: after an assistant turn whose record
  lists changed files, the transcript shows a collapsed row naming them, and
  expanding it loads and renders each file's patch.
- Add a session-wide review, reachable from the view's document menu and a
  command, that lists every file changed during the conversation with per-file
  counts and patches, bounded to the conversation rather than the whole
  workspace.
- Render patches as a parsed unified diff in the active theme: additions and
  removals tinted, context muted, long lines soft-wrapped, and a per-file header
  with status and added/removed counts. Rendering is per file on expansion, with
  an explicit cap and a "partial" marker for patches the service flags.
- Offer per-file actions: open the file and copy the patch. Deleted or
  outside-vault files keep their path but have no open action.
- Load patches lazily, hold them in memory for the view's lifetime, and never
  persist them. Failures stay local to the review surface with a retry, leaving
  chat, execution, and permissions unaffected.
- **BREAKING**: none. No new persisted setting or compatibility requirement;
  the review is a read-only, additive surface.

## Capabilities

### New Capabilities

- `conversation-diff-review`: the read-only review of files an agent changed
  during a conversation, shown per turn and as a session-wide summary, without
  gating or altering execution.

### Modified Capabilities

None. The transcript disclosure follows the existing `native-chat`
supporting-detail pattern, and permission handling is unchanged.

## Impact

- `src/opencode/`: a diff accessor over the generated client's
  `client.session.diff`, reusing the existing connection/contract seams.
- `src/state/`: thread the selected session and its assistant turn snapshots to
  the diff surface; a small in-memory cache keyed by session and snapshot bounds.
- `src/ui/conversation.ts` and a new patch renderer: the per-turn disclosure and
  the unified-diff presentation.
- `src/ui/chat-view.ts`, `src/main.ts`: the document-menu item and the command
  that open the session review, plus a review modal.
- `styles.css`: diff line tints and wrapping using existing theme variables.
- Tests: patch parsing and bounds selection, the disclosure and modal, disabled
  actions, the cap, and failure isolation. Manual acceptance and a
  `docs/runtime-compatibility.md` entry record live verification.
- No protocol, dependency, credential, or persistence change beyond calls to an
  already-generated endpoint.
