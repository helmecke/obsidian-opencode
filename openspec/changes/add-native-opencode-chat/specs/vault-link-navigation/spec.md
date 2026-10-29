# Spec Delta

## Purpose

Make vault references in chat answers navigable using Obsidian's Markdown and internal-link conventions.

## ADDED Requirements

### Requirement: Obsidian Markdown presentation
Chat answers SHALL render as Obsidian Markdown, preserving code blocks and inline code as literal content. Incomplete streamed markup SHALL NOT prevent continued streaming or final rendering.

#### Scenario: Link syntax inside code
- **WHEN** an answer contains wikilink syntax inside inline code or a fenced code block
- **THEN** that syntax remains literal code rather than becoming a note-navigation control

#### Scenario: Stream splits a link
- **WHEN** a wikilink arrives across multiple text deltas
- **THEN** the completed answer renders it correctly without breaking the conversation

### Requirement: Vault wikilink navigation
The view SHALL resolve note names, vault-relative paths, aliases, heading references, and block references using Obsidian's internal-link semantics. Activating a resolved link SHALL open the target in a non-chat leaf while preserving the conversation.

#### Scenario: Follow a link with a display name
- **WHEN** the user activates `[[Notes/Example|Example note]]`
- **THEN** Obsidian opens the target note and the chat remains available with its conversation intact

#### Scenario: Follow a heading or block
- **WHEN** the user activates `[[Example#Details]]` or `[[Example#^block-id]]`
- **THEN** navigation preserves the requested heading or block target

### Requirement: Stable link source context
Each conversation SHALL retain a stable source context for relative link resolution. Without an explicitly associated source note, references SHALL resolve from the vault root; changing the active editor SHALL NOT silently alter existing answer links.

#### Scenario: Active note changes
- **WHEN** the user switches active notes after receiving an answer
- **THEN** the answer's relative links retain their original resolution context

### Requirement: Unresolved references do not create files
Activating an unresolved or contextless internal reference SHALL show a non-destructive indication and SHALL NOT automatically create or modify a vault file.

#### Scenario: Missing target
- **WHEN** the user activates a link for which Obsidian finds no target
- **THEN** the plugin reports the unresolved target and leaves vault files unchanged
