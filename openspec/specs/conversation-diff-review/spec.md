# conversation-diff-review Specification

## Purpose

Show a read-only review of the files an OpenCode agent changed during a conversation, per turn and as a session-wide summary, without gating or altering execution.

## Requirements

### Requirement: Turn changed-files disclosure
The transcript SHALL show, after an assistant turn whose record reports one or more changed files, a collapsed disclosure naming the files changed in that turn, and SHALL show no such disclosure for a turn that reports none. Expanding the disclosure SHALL load and show each changed file's patch.

#### Scenario: Turn with changes
- **WHEN** an assistant turn's record lists one or more changed files
- **THEN** the transcript shows a collapsed changed-files disclosure after that turn naming the files, and a turn that lists none shows no disclosure

#### Scenario: Expand the turn
- **WHEN** the user expands a changed-files disclosure
- **THEN** each file listed in that turn loads and shows its patch

### Requirement: Session changed-files review
The view SHALL offer a review of the changes made during the current conversation, reachable from the view's document menu and from a command. The review SHALL describe only changes made during the conversation, bounded from the first prompt of the conversation to the last, and SHALL list them per file with change counts.

#### Scenario: Open from the document menu
- **WHEN** the user chooses the review item in the view's document menu
- **THEN** a review of this conversation's changed files opens

#### Scenario: Open from a command
- **WHEN** the user runs the review command
- **THEN** the same review of this conversation's changed files opens

#### Scenario: Conversation-bounded
- **WHEN** the review opens
- **THEN** files changed before the conversation began are not listed, and files changed during it appear with their counts

### Requirement: Patch presentation
Each changed file's patch SHALL render as a unified diff using the active theme: additions and removals distinguished, context lines muted, and long lines soft-wrapped. Each file SHALL show a header naming the file, its status, and its added and removed counts. A patch SHALL render only when its file is expanded, SHALL be capped with an explicit control to reveal the rest, and SHALL be marked partial when the service flags it. A file with no readable patch SHALL show its status and a note.

#### Scenario: Tinted and wrapped diff
- **WHEN** a changed file's patch is shown
- **THEN** added and removed lines are visually distinguished, context lines are muted, long lines wrap without horizontal scrolling, and a header shows the file, its status, and its counts

#### Scenario: Large patch
- **WHEN** a patch exceeds the display cap
- **THEN** the view shows the patch up to the cap with an explicit control to reveal the rest

#### Scenario: Partial patch
- **WHEN** the service marks a patch as partial
- **THEN** the view indicates that only part of the change is shown

#### Scenario: No readable patch
- **WHEN** a changed file has no readable patch, such as a binary change
- **THEN** the view shows the file's status and a note instead of a diff

### Requirement: Per-file actions
Each changed file SHALL offer to open the file and to copy its patch. A file that has been deleted or lies outside the vault SHALL show its path and offer no open action.

#### Scenario: Open a file
- **WHEN** the user activates open on a changed file that still exists in the vault
- **THEN** the file opens through the vault's existing link behavior

#### Scenario: Copy a patch
- **WHEN** the user activates copy on a changed file
- **THEN** the file's patch is placed on the clipboard

#### Scenario: Deleted or outside the vault
- **WHEN** a changed file has been deleted or lies outside the vault
- **THEN** the view shows its path but offers no open action

### Requirement: Lazy, in-memory diff loading
Patches SHALL be requested only when a disclosure is expanded or the review is opened, SHALL be held in memory for the view's lifetime, and SHALL NOT be persisted into plugin data, transcripts, or logs. The session review SHALL refresh from the service each time it opens.

#### Scenario: Loaded on demand
- **WHEN** a conversation is displayed
- **THEN** no diff is requested until the user expands a disclosure or opens the review

#### Scenario: Not persisted
- **WHEN** patches are loaded
- **THEN** they remain in memory only and are never written to plugin data, a transcript, or a log

#### Scenario: Review refreshes
- **WHEN** the session review is opened again after the conversation changed
- **THEN** the review reflects the current conversation state from the service

### Requirement: Failure isolation
When patch data cannot be loaded, the disclosure or review SHALL show a compact error with a retry action and SHALL NOT alter the transcript, execution state, permission handling, or connection status. The feature SHALL NOT add a required service contract.

#### Scenario: Load failure
- **WHEN** a diff request fails
- **THEN** the affected disclosure or review shows a compact error with retry, and the transcript, execution, permissions, and connection are unchanged

#### Scenario: Retry
- **WHEN** the user activates retry on a failed review
- **THEN** the diff is requested again and, on success, the review shows the files and patches
