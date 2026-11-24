# vault-link-navigation Specification

## Purpose

Make vault references in chat answers navigable using Obsidian's Markdown and internal-link conventions.

## Requirements

### Requirement: Obsidian Markdown presentation
Chat answers SHALL render as Obsidian Markdown, preserving code blocks and inline code as literal content. Incomplete streamed markup SHALL NOT prevent continued streaming or final rendering.

#### Scenario: Link syntax inside code
- **WHEN** an answer contains wikilink syntax inside inline code or a fenced code block
- **THEN** that syntax remains literal code rather than becoming a note-navigation control

#### Scenario: Stream splits a link
- **WHEN** a wikilink arrives across multiple text deltas
- **THEN** the completed answer renders it correctly without breaking the conversation

### Requirement: Vault wikilink navigation
The view SHALL resolve note names, vault-relative paths, aliases, heading references, and block references using Obsidian's internal-link semantics. Activating a resolved link SHALL open the target according to the pointer modifier, never navigating the chat leaf, while preserving the conversation.

#### Scenario: Follow a link with a display name
- **WHEN** the user activates `[[Notes/Example|Example note]]`
- **THEN** Obsidian opens the target note and the chat remains available with its conversation intact

#### Scenario: Follow a heading or block
- **WHEN** the user activates `[[Example#Details]]` or `[[Example#^block-id]]`
- **THEN** navigation preserves the requested heading or block target

#### Scenario: New tab with the tab modifier
- **WHEN** the user activates a resolved link with Cmd/Ctrl held
- **THEN** the target opens in a new tab in the chat's tab group rather than a new split or the last focused group

#### Scenario: New window with the window modifier
- **WHEN** the user activates a resolved link with Cmd/Ctrl+Alt+Shift held
- **THEN** the target opens in a new window

#### Scenario: Plain click reuses the current note tab
- **WHEN** the user activates a resolved link with a plain click and the only note tab shares the chat's tab group
- **THEN** the target replaces that note tab's document and the chat stays open in its tab

#### Scenario: Plain click without a note tab opens a tab
- **WHEN** the user activates a resolved link with a plain click and no note tab is open in the root split
- **THEN** the target opens in a new tab in the chat's tab group instead of a new split

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

### Requirement: Chat note group
The view SHALL keep a note group beside the chat that Cmd/Ctrl+Alt+click opens into. The group SHALL be created to the right of the chat on first use, appended to on later Cmd/Ctrl+Alt-clicks, and recreated after it is closed. A target already open in the group SHALL be focused rather than duplicated. The group SHALL belong to a single chat tab and SHALL be remembered only for the lifetime of that tab.

#### Scenario: First use creates the group
- **WHEN** the user activates a resolved link with Cmd/Ctrl+Alt held and no note group exists
- **THEN** a note group opens to the right of the chat and displays the target

#### Scenario: Later clicks append to the group
- **WHEN** the user activates another resolved link with Cmd/Ctrl+Alt held while the group exists
- **THEN** the target opens as another tab in the same group instead of creating a new group

#### Scenario: Existing note is focused
- **WHEN** the activated link targets a note already open in the group
- **THEN** the existing tab is focused and its heading or block target is applied rather than a second tab being added

#### Scenario: Closed group is recreated
- **WHEN** the user closes the note group and then activates a resolved link with Cmd/Ctrl+Alt held
- **THEN** a new note group is created to the right of the chat

#### Scenario: Group is scoped to the chat tab
- **WHEN** two chat tabs are open and each activates a link with Cmd/Ctrl+Alt held
- **THEN** each chat tab gets its own note group rather than sharing one

#### Scenario: Restart starts a fresh group
- **WHEN** the plugin reloads or Obsidian restarts and the user activates a link with Cmd/Ctrl+Alt held
- **THEN** a new note group is created rather than an existing group being adopted

#### Scenario: Focus honours the app preference
- **WHEN** a link opens a document in the note group
- **THEN** the document is focused according to Obsidian's Always focus new tabs preference
