# Design

## Context

See `proposal.md` - Why. The composer currently sends `client.session.prompt({ sessionID, id, text, skills })` (`src/state/prompt-coordinator.ts`), and `[[Note]]` is inserted as inert text (`src/ui/composer-link.ts`, `src/ui/composer-suggest.ts`). The pinned `@opencode/client` exposes `SessionPromptInput.files`, a `uri`-based attachment list present in the base `2.2.2` contract, so no service or compatibility change is needed. The server reads `file:///` URIs itself (MIME detected server-side, 20 MiB per attachment), and the plugin is desktop-only, so Node path/URL helpers are available behind the existing adapter boundary.

## Goals / Non-Goals

**Goals:**
- Attach explicit notes, the editor selection, and the active note to a message.
- Keep the typed text and the visible `[[Note]]` reference unchanged.
- Reuse the existing prompt identity and recovery path for attachments.
- Keep the plugin from reading note contents; send references, not copies.

**Non-Goals:**
- Folders, tags, properties, images, and web/YouTube URLs.
- Narrowing a note attachment to a heading or block line range, or an aggregated diff of what a chat changed.
- Changing model/provider selection or the permissions flow.

## Decisions

### 1. Native `files` attachments, not injected text
Notes are sent as `SessionPromptInput.files` entries (`{ uri, name }`) with a `file:///` URI built from the absolute vault path. The server reads the file, so the plugin never copies or truncates note content.

- **Why:** structure is preserved, large notes are not duplicated into the prompt, and the service owns MIME detection and its 20 MiB cap.
- **Alternative rejected:** read the note and prepend its text - doubles payloads, loses file semantics, and forces the plugin to read vault content.

### 2. `[[Note]]` attaches by reusing the existing reference surface
The `[[` completion still inserts `[[Basename]]` or `[[folder/Basename]]` text. At send time the view resolves each reference to a `TFile` with Obsidian's link resolution (`getFirstLinkpathDest` after stripping alias, heading, and block fragments) and passes resolved files alongside the prompt. Duplicate references collapse to one file; unresolved references stay text.

- **Why:** matches the existing `$skill` behavior (visible text plus structured attachment) and keeps the completion, pairing, and keyboard contracts untouched.
- **Alternative rejected:** a separate `@` picker - adds a fourth trigger and duplicates note search.

### 3. Selection is snapshotted text
Attaching a selection stores `{ text, sourcePath }` at attach time. At send time it is prepended to the transmitted text as a labelled block (`Selected text from [[Note]]:\n\n<text>`), while the composer keeps the user's typed text unchanged. The chip shows a truncated preview.

- **Why:** deterministic and visible; a selection has no file identity to attach.
- **Alternative rejected:** read the live selection at send - silent changes surprise the user.

### 4. Active note is explicit; auto-attach is opt-in
The **Attach active note** action attaches the open Markdown note on demand. A new setting, **Attach active note automatically**, is off by default; when on, sending attaches the active note if it is not already attached.

- **Why:** preserves the documented privacy posture that the active editor is never attached without the user asking.
- **Alternative rejected:** Copilot-style on-by-default - sends vault content implicitly.

### 5. One attachment list flows through the composer and prompt
A per-message `MessageAttachment` list (`note` with a `TFile`, `selection` with text) lives in `ChatComposer`, renders as removable chips above the textarea, and is cleared only after confirmed admission. `ChatView` resolves `[[...]]` references and hands `{ text, attachments }` to `SynchronizationActions.sendMessage`; that method appends the selection block, converts notes to `files`, dedupes by path, and calls `PromptCoordinator.send(text, skillIDs, files)`.

- **Why:** keeps resolution in the layer that already owns `app`/`TFile`, keeps the coordinator free of Obsidian types, and makes retry reuse trivial.
- **Alternative rejected:** resolve links inside `SynchronizationActions` - it has no Obsidian vault handle.

### 6. Size and failure handling
Attach time skips a file whose `TFile.stat.size` exceeds 20 MiB and shows a notice; send time omits an unresolvable file. A service-side rejection surfaces as an ordinary send failure and keeps the draft and chips, matching the existing uncertain-send behavior.

- **Why:** avoids a predictable failure and keeps recovery consistent.

### 7. Update the documented invariant
AGENTS.md changes from "`[[Note]]` stays plain prompt text" to "`[[Note]]` stays visible prompt text and attaches the note as a structured file reference", and the "never auto-attach the active editor" wording gains the opt-in setting exception. README privacy and composer sections follow.

## Risks / Trade-offs

- **A pure textual reference now also sends the file** - the prompt grows and may cost more. Mitigation: the chip is visible and removable before send; the text still reads normally.
- **Whole-note attachment for a `[[Note#Heading]]` reference** - the agent receives the entire note. Mitigation: accepted for v1; heading line ranges are a later change.
- **`file:///` lets the local service read any path it can access** - a reference is a path, not a sandbox. Mitigation: only vault files the user explicitly attaches, with the existing vault-workspace caveat in the README.
- **Selection can duplicate note content** - larger prompts. Mitigation: chip preview and removal.
- **Typed references may resolve differently than the completion intended** - aliases or moved notes. Mitigation: resolve at send time and fall back to text when unresolved.

## Migration Plan

Additive setting with a default; no stored-data migration. Update specs, AGENTS.md, and README, then ship. Rollback is removing the attachment flow; no transcripts or settings need repair.

## Open Questions

- Whether to use the server's `?start=&end=` line range to narrow `[[Note#Heading]]` attachments - safe to decide in a later change.
