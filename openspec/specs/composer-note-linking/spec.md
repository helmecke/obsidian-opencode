# composer-note-linking Specification

## Purpose

Lets a user reference vault notes while composing a chat message by pairing square brackets and completing note names inline, with unambiguous link text inserted into the prompt.

## Requirements

### Requirement: Square bracket pairing
The composer SHALL treat a typed `[` as the opening of a pair, inserting a matching `]` with the caret between them. A typed `]` immediately before an existing `]` SHALL move the caret past it rather than adding another, and backspacing an empty pair SHALL remove both brackets.

#### Scenario: Type an opening bracket
- **WHEN** the user types `[` at an empty or mid-text caret
- **THEN** the composer inserts `[]` and places the caret between the brackets

#### Scenario: Skip an existing closer
- **WHEN** the caret is directly before a `]` and the user types `]`
- **THEN** the caret moves past the existing `]` without inserting a duplicate

#### Scenario: Delete an empty pair
- **WHEN** the caret sits between a `[` and its immediately adjacent `]` and the user presses Backspace
- **THEN** both brackets are removed

#### Scenario: Wrap a selection
- **WHEN** text is selected and the user types `[`
- **THEN** the selection is wrapped in `[]` with the caret after the closing bracket

### Requirement: Note completion on double bracket
Typing `[[` SHALL open an inline completion popover over the vault's Markdown notes, matched and ranked with Obsidian's fuzzy search. Each suggestion SHALL show the note's basename with its folder path underneath. The popover SHALL NOT appear unless an unclosed `[[` precedes the caret.

#### Scenario: Open on double bracket
- **WHEN** the user types `[[`
- **THEN** an inline popover lists Markdown notes matching the query that follows

#### Scenario: Rows show name and folder
- **WHEN** the popover is open
- **THEN** each row displays the note's basename and, underneath it, its vault-relative folder path

#### Scenario: No popover without a trigger
- **WHEN** no unclosed `[[` precedes the caret
- **THEN** the completion popover does not show

### Requirement: Unambiguous link insertion
Selecting a suggestion SHALL insert link text that unambiguously resolves to the chosen note: the basename when it is unique in the vault, otherwise a vault-relative path. Only Markdown notes SHALL be offered.

#### Scenario: Unique basename
- **WHEN** the user selects a note whose basename is unique in the vault
- **THEN** the composer inserts `[[Basename]]` at the caret

#### Scenario: Duplicate basename
- **WHEN** the user selects a note whose basename matches another note in a different folder
- **THEN** the composer inserts a vault-relative path such as `[[folder/Basename]]`

#### Scenario: Notes only
- **WHEN** the popover is open
- **THEN** only Markdown notes are offered; attachments and other file types are excluded

### Requirement: Keyboard navigation and dismissal
The popover SHALL be navigable by keyboard without sending the message, and SHALL close on selection, blur, or `Escape`. While the popover is open, `Enter` SHALL confirm the highlighted suggestion and SHALL NOT send the message; the next `Enter`, once the popover has closed, SHALL send.

#### Scenario: Navigate and select
- **WHEN** the popover is open and the user moves with the arrow keys and confirms with Enter or Tab
- **THEN** the highlighted suggestion is inserted and the message is not sent

#### Scenario: Escape or blur closes
- **WHEN** the user presses Escape or focus leaves the composer
- **THEN** the popover closes and the composer text is left unchanged

#### Scenario: Send after selecting
- **WHEN** the user confirms a suggestion and the popover closes
- **THEN** the next Enter sends the message with the inserted reference

#### Scenario: Send while open
- **WHEN** the popover is open and the user presses Enter
- **THEN** the highlighted suggestion is inserted instead and the message is not sent

### Requirement: Reference remains prompt text
An inserted note reference SHALL remain visible prompt text, and sending a message that contains it SHALL transmit that text unchanged while also attaching the referenced note as a structured file. The attachment SHALL resolve to the note the reference resolves to, SHALL be sent at most once per note, and SHALL reuse its identity on retry.

#### Scenario: Send a message with a link
- **WHEN** the user sends a message containing an inserted `[[...]]` reference
- **THEN** the prompt text still contains the reference and the referenced note is attached as a structured file

#### Scenario: Duplicate reference
- **WHEN** the message references the same note twice
- **THEN** the note is attached once

#### Scenario: Reference without a note
- **WHEN** an inserted reference no longer resolves to a vault note at send time
- **THEN** the text is sent unchanged and no attachment is added

#### Scenario: Retry keeps the attachment
- **WHEN** an unconfirmed prompt with a note attachment is retried after reconciliation
- **THEN** the retry uses the same prompt identity and the same attachment
