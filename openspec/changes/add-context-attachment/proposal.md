# Proposal

## Why

The composer can send only prompt text and skill identifiers. A `[[Note]]` reference stays inert text, and the note open in the editor is never attached, so users must paste content or rely on the agent to find files by name. Context attachment is the highest-leverage parity gap with Copilot and the most common daily research/writing flow: point the agent at the note or selection you are already looking at.

## What Changes

- A `[[Note]]` reference selected in the composer now attaches that note as a structured file (`file:///` URI) while its text stays visible and is tied to the attachment through the prompt's mention offsets. This **replaces** the current contract that a reference remains plain prompt text.
- The composer gains explicit **Attach selection** and **Attach active note** affordances, rendered as removable attachment chips above the input before send.
- The editor selection is snapshotted as inline text when attached; the active note is attached only when requested (an optional setting can make new chats attach it automatically, default off).
- Attachments survive the existing admission/uncertain-send reconciliation with the same prompt identity; identical notes attach once.
- Out of scope for this version: folders, tags, properties, images, and web/YouTube URLs.

## Capabilities

### New Capabilities

- `composer-context-attachment`: attaching vault notes, the editor selection, and the active note to a chat message as structured context, with removable chips and send-time resolution.

### Modified Capabilities

- `composer-note-linking`: the "Reference remains prompt text" requirement changes to require attaching the referenced note while keeping the visible reference text.

## Impact

- Composer and send path: `src/ui/chat-composer.ts`, `src/ui/composer-suggest.ts`, `src/ui/composer-link.ts`, `src/ui/chat-view.ts`, `src/state/synchronization-actions.ts`.
- Prompt admission: `src/state/prompt-coordinator.ts` gains a `files` field on `PendingPrompt` and `transmit()`; the request type is the client's `SessionPromptInput`, so no new outgoing-payload validator is required.
- Settings: an optional "attach active note automatically" preference (default off).
- Documentation and contracts: `openspec/specs/composer-note-linking/spec.md`, and the AGENTS.md invariant that `[[Note]]` stays plain prompt text.
- No service, dependency, or compatibility-range change: `files` is part of the existing `>=2.2.2 <3.0.0` contract.
