# composer-skill-mentions Specification

## Purpose

Lets a user find and reference OpenCode skills while composing a chat message, and tells OpenCode which skills the message explicitly mentions.

## Requirements

### Requirement: Dollar trigger
The composer SHALL open a skill completion popover when the caret follows a `$` that starts the input or follows whitespace and no whitespace or newline separates that `$` from the caret. A `$` inside a word or a query that has gained whitespace or a newline SHALL NOT open the popover.

#### Scenario: Trigger at the start
- **WHEN** the composer is empty and the user types `$`
- **THEN** the skill completion popover opens with the full skill catalog

#### Scenario: Trigger after whitespace
- **WHEN** the user types a space and then `$` in the middle of the message
- **THEN** the skill completion popover opens for the text after the `$`

#### Scenario: No trigger inside a word
- **WHEN** the user types `word$` with no whitespace before the `$`
- **THEN** the skill completion popover does not open

#### Scenario: Query with whitespace
- **WHEN** the user types `$skill name` so that the text after the `$` contains a space
- **THEN** the skill completion popover does not open

### Requirement: Skill catalog
The popover SHALL offer the skills that the connected OpenCode service reports for the vault's directory. It SHALL load that catalog on demand the first time completion is requested and SHALL NOT load it during the initial connection.

#### Scenario: List available skills
- **WHEN** the user opens the skill popover and the service returns skills
- **THEN** the popover lists those skills

#### Scenario: Row content
- **WHEN** a listed skill has a description
- **THEN** its row shows the skill name and the description

#### Scenario: Deferred loading
- **WHEN** a conversation becomes ready but the user has not triggered skill completion
- **THEN** the plugin has not requested the skill catalog

### Requirement: Filtering and ranking
The popover SHALL filter skills by a fuzzy match on the skill name and SHALL present an empty query in name order. Matching skills SHALL be ordered by match quality.

#### Scenario: Narrow by typing
- **WHEN** the popover is open and the user types part of a skill name
- **THEN** only fuzzy-matching skills remain

#### Scenario: Empty query
- **WHEN** the popover opens with no query after the `$`
- **THEN** all available skills are listed in name order

#### Scenario: No match
- **WHEN** the query matches no skill
- **THEN** the popover shows no suggestion rows

### Requirement: Mention insertion
Selecting a skill SHALL replace the text from the triggering `$` through the caret with `$skill-name ` and place the caret after the inserted space. Text after the original caret SHALL be preserved, and the message SHALL NOT be sent.

#### Scenario: Insert from a partial query
- **WHEN** the user types `$app` and selects the `apply` skill
- **THEN** the composer contains `$apply ` and the caret sits after the space

#### Scenario: Preserve following text
- **WHEN** the caret is in the middle of a message and the user selects a skill
- **THEN** the text that followed the caret remains after the inserted mention

#### Scenario: Selection does not send
- **WHEN** the user selects a skill with the keyboard or pointer
- **THEN** the popover closes and the message is not sent

### Requirement: Keyboard and dismissal
The popover SHALL support arrow-key navigation and selection with Enter or Tab. `Escape` or focus leaving the composer SHALL close it without changing the message. While the popover is open, `Enter` SHALL confirm the highlighted skill and SHALL NOT send; the next `Enter`, once the popover has closed, SHALL send.

#### Scenario: Navigate and select
- **WHEN** the popover is open and the user moves with the arrow keys and presses Enter or Tab
- **THEN** the highlighted skill is inserted and the message is not sent

#### Scenario: Escape or blur closes
- **WHEN** the user presses Escape or focus leaves the composer
- **THEN** the popover closes and the composer text is unchanged

#### Scenario: Send after selecting
- **WHEN** the user confirms a skill and the popover closes
- **THEN** the next Enter sends the message once with the inserted mention

#### Scenario: Send while open
- **WHEN** the popover is open and the user presses Enter
- **THEN** the highlighted skill is inserted instead and the message is not sent

### Requirement: Structured skill attachment
When a message containing `$name` mentions is sent, the plugin SHALL attach the server-provided identifier of each skill whose name exactly matches a mention, once per skill, and SHALL send the message text unchanged. Mentions that match no loaded skill SHALL remain plain text and SHALL add no attachment.

#### Scenario: Selected skill is attached
- **WHEN** the user selects `$apply` and sends the message
- **THEN** the prompt carries the `apply` skill identifier together with the unchanged text `$apply`

#### Scenario: Manually typed mention is attached
- **WHEN** the user types a known `$skill-name` mention without using the popover and sends
- **THEN** the prompt carries that skill's identifier

#### Scenario: Duplicate mention attaches once
- **WHEN** the message mentions the same skill twice
- **THEN** the prompt carries that skill's identifier only once

#### Scenario: Unknown mention stays text
- **WHEN** the message contains `$unknown` and no loaded skill has that name
- **THEN** the prompt text still contains `$unknown` and carries no identifier for it

#### Scenario: Retry keeps attachments
- **WHEN** an unconfirmed prompt with skill attachments is retried after reconciliation
- **THEN** the retry uses the same prompt identity and the same skill identifiers

### Requirement: Non-blocking skill loading
A failure to load the skill catalog SHALL NOT block composing or sending. The composer SHALL keep accepting text, and a message that mentions skills SHALL still be sent as plain text when no catalog is available.

#### Scenario: Catalog request fails
- **WHEN** the skill catalog request fails after the user types `$`
- **THEN** the composer remains usable and no skill rows are shown

#### Scenario: Send without a catalog
- **WHEN** the skill catalog is unavailable and the user sends a message containing `$skill-name`
- **THEN** the message is sent with that text and without a skill attachment
