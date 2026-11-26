# Spec Delta

## Purpose

Lets a user attach vault notes, the editor selection, and the active note to a chat message as structured context, so the agent works from exactly the material the user points at instead of searching for it.

## ADDED Requirements

### Requirement: Explicit context affordances
The composer SHALL offer an **Attach selection** action when the active editor has a non-empty selection and an **Attach active note** action when a Markdown note is open. It SHALL NOT offer either action when its source is unavailable, and SHALL NOT attach either source without an explicit user action unless automatic active-note attachment is enabled.

#### Scenario: Selection available
- **WHEN** the active editor has selected text and the user activates **Attach selection**
- **THEN** the selection is added to the message's context

#### Scenario: No selection
- **WHEN** the active editor has no selection
- **THEN** the **Attach selection** action is not offered

#### Scenario: No active note
- **WHEN** no Markdown note is open
- **THEN** the **Attach active note** action is not offered

### Requirement: Removable attachment chips
Each attached item SHALL appear as a chip in the composer before sending, identifying its source, and SHALL be removable individually. Removing a chip SHALL remove that item from the next message and leave the composer text unchanged.

#### Scenario: Remove an attachment
- **WHEN** the user removes a note chip
- **THEN** the next message is sent without that note and the typed text is unchanged

#### Scenario: Send clears chips
- **WHEN** a message with attachments is confirmed as admitted
- **THEN** its attachment chips are cleared with the message text

### Requirement: Selection snapshot as text
An attached selection SHALL be captured at the moment it is attached and sent as message text, not as a file attachment. It SHALL be labelled with its source note and SHALL remain stable if the editor selection changes before send.

#### Scenario: Changed selection
- **WHEN** the user attaches a selection and then changes the editor selection before sending
- **THEN** the message carries the originally attached text

### Requirement: Active note attachment
An attached active note SHALL be sent as a structured file attachment for that note while the composer text remains unchanged. A setting SHALL allow new messages to attach the active note automatically; that setting SHALL be off by default.

#### Scenario: Attach active note
- **WHEN** a Markdown note is open and the user activates **Attach active note**
- **THEN** the next message carries that note as a file attachment

#### Scenario: Automatic attachment disabled
- **WHEN** automatic active-note attachment is disabled and the user sends without attaching
- **THEN** the open note is not attached

### Requirement: Attachment resolution and deduplication
Sending SHALL resolve each note attachment to a vault file and attach it at most once per file. A reference or item that does not resolve to a vault file SHALL be omitted without blocking the send.

#### Scenario: Duplicate note
- **WHEN** the same note is attached twice in one message
- **THEN** the prompt carries it once

#### Scenario: Unresolvable note
- **WHEN** an attached note no longer exists at send time
- **THEN** the message sends without it and reports no attachment error

### Requirement: Attachment delivery and recovery
Attachments SHALL be sent with the prompt under the existing stable prompt identity, and a reconciled retry SHALL reuse the same attachments. A failed admission SHALL retain the attachments for recovery.

#### Scenario: Retry keeps attachments
- **WHEN** an unconfirmed prompt with attachments is reconciled and retried
- **THEN** the retry uses the same prompt identity and the same attachments

### Requirement: No plugin-side file reads
Note attachments SHALL be sent as file references rather than file contents, and the plugin SHALL NOT read or copy a vault file to build an attachment. The only content the plugin reads is the selected text range.

#### Scenario: Note attachment sends a reference
- **WHEN** a note is attached
- **THEN** the plugin sends a file reference and does not read the note's contents
