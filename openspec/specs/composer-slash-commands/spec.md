# composer-slash-commands Specification

## Purpose

Lets a user find and run OpenCode slash commands from the chat composer, with inline completion of registered command names and client-side dispatch of the selected command.

## Requirements

### Requirement: Slash trigger
The composer SHALL open a command completion popover only when the message starts with `/` and the caret remains inside that first token, with no whitespace or newline between the `/` and the caret. A `/` after other text, a `/` inside a word, or a caret in the arguments SHALL NOT open the popover.

#### Scenario: Trigger at the start
- **WHEN** the composer is empty and the user types `/`
- **THEN** the command completion popover opens with the full command catalog

#### Scenario: Filter while typing the name
- **WHEN** the user types `/rev` at the start of the message
- **THEN** the popover shows commands matching `rev`

#### Scenario: Nested command name
- **WHEN** the user types `/team/rev`
- **THEN** the popover stays open and matches nested command names containing `/`

#### Scenario: Caret in the arguments
- **WHEN** the message is `/review src` and the caret is in `src`
- **THEN** the command completion popover does not open

#### Scenario: No trigger after text
- **WHEN** the user types `see /review` so the `/` does not start the message
- **THEN** the command completion popover does not open

#### Scenario: No trigger inside a word
- **WHEN** the user types `and/or` so the `/` does not start the message
- **THEN** the command completion popover does not open

### Requirement: Command catalog
The popover SHALL offer the commands the connected OpenCode service reports for the vault's directory. It SHALL load that catalog on demand the first time completion is requested, SHALL reuse the loaded catalog for the connection, and SHALL NOT load it during the initial connection.

#### Scenario: List available commands
- **WHEN** the user opens the command popover and the service returns commands
- **THEN** the popover lists those commands

#### Scenario: Row content
- **WHEN** a listed command has a description
- **THEN** its row shows the command as invoked (`/name`) and the description

#### Scenario: Deferred loading
- **WHEN** a conversation becomes ready but the user has not triggered command completion
- **THEN** the plugin has not requested the command catalog

#### Scenario: Reuse across triggers
- **WHEN** the user opens the command popover again in the same connection
- **THEN** the plugin reuses the catalog it already loaded

### Requirement: Non-blocking command loading
A failure to load the command catalog SHALL NOT block composing or sending. The composer SHALL show no command rows and SHALL keep accepting text.

#### Scenario: Catalog request fails
- **WHEN** the command catalog request fails after the user types `/`
- **THEN** the popover shows no rows, the composer remains usable, and no error replaces the composer status

#### Scenario: Send without a catalog
- **WHEN** the command catalog is unavailable and the user sends `/review`
- **THEN** the message is sent as ordinary prompt text

### Requirement: Filtering and ranking
The popover SHALL filter commands by a fuzzy match on the command name and SHALL present an empty query in name order. Matching commands SHALL be ordered by match quality.

#### Scenario: Narrow by typing
- **WHEN** the popover is open and the user types part of a command name
- **THEN** only fuzzy-matching commands remain

#### Scenario: Empty query
- **WHEN** the popover opens with no query after the `/`
- **THEN** all available commands are listed in name order

#### Scenario: No match
- **WHEN** the query matches no command
- **THEN** the popover shows no suggestion rows

### Requirement: Command insertion
Selecting a command SHALL replace the text from the leading `/` through the caret with `/name ` and place the caret after the inserted space. Text after the original caret SHALL be preserved, and the message SHALL NOT be sent.

#### Scenario: Insert from a partial query
- **WHEN** the user types `/rev` and selects the `review` command
- **THEN** the composer contains `/review ` and the caret sits after the space

#### Scenario: Insert a nested command
- **WHEN** the user selects the `team/review` command
- **THEN** the composer contains `/team/review ` and the caret sits after the space

#### Scenario: Preserve following text
- **WHEN** the caret is inside the command name and the user selects a command
- **THEN** the text that followed the caret remains after the inserted name

#### Scenario: Selection does not send
- **WHEN** the user selects a command with the keyboard or pointer
- **THEN** the popover closes and the message is not sent

### Requirement: Keyboard and dismissal
The popover SHALL support arrow-key navigation and selection with Enter or Tab. `Escape` or focus leaving the composer SHALL close it without changing the message. Ctrl/Cmd+Enter SHALL still send the message while the popover is open.

#### Scenario: Navigate and select
- **WHEN** the popover is open and the user moves with the arrow keys and presses Enter or Tab
- **THEN** the highlighted command is inserted and the message is not sent

#### Scenario: Escape or blur closes
- **WHEN** the user presses Escape or focus leaves the composer
- **THEN** the popover closes and the composer text is unchanged

#### Scenario: Send while open
- **WHEN** the popover is open and the user presses Ctrl/Cmd+Enter
- **THEN** the message sends once and the popover does not intercept the shortcut

### Requirement: Command execution on send
When the message starts with `/` and its first whitespace-delimited token exactly matches a loaded command, sending SHALL run that command with the remaining text as its arguments instead of sending the message as a prompt. A confirmed run SHALL clear the composer.

#### Scenario: Run a known command
- **WHEN** the user sends `/review` and `review` is a loaded command
- **THEN** the plugin runs `review` and does not send `/review` as prompt text

#### Scenario: Pass arguments
- **WHEN** the user sends `/review src/auth.ts` and `review` is a loaded command
- **THEN** the plugin runs `review` with `src/auth.ts` as its arguments

#### Scenario: Run a nested command
- **WHEN** the user sends `/team/review src/auth.ts` and `team/review` is a loaded command
- **THEN** the plugin runs `team/review` with `src/auth.ts` as its arguments

#### Scenario: Unknown command stays prompt text
- **WHEN** the user sends `/unknown` and no loaded command has that name
- **THEN** the message is sent as ordinary prompt text

#### Scenario: Confirmed run clears the composer
- **WHEN** the service accepts the command
- **THEN** the composer is cleared and the conversation reflects the command's result

### Requirement: Command send failure
A failed command send SHALL keep the message text in the composer, report the failure in the composer card, and SHALL NOT automatically resend the command.

#### Scenario: Service rejects the command
- **WHEN** the command request fails
- **THEN** the composer still contains the message and the composer card shows an error

#### Scenario: No automatic retry
- **WHEN** a command send fails
- **THEN** the plugin does not resend it with a new identity on its own

#### Scenario: Blocked while a prompt is unconfirmed
- **WHEN** a prompt is already sending or awaiting reconciliation and the user sends a command
- **THEN** the command is not started and the existing composer error explains that the pending prompt must settle first

### Requirement: Skill mentions in command arguments
A command message SHALL attach the same skill identifiers as an ordinary message when its arguments contain `$name` mentions that exactly match loaded skills. The argument text SHALL be sent unchanged apart from the command token.

#### Scenario: Mention in arguments
- **WHEN** the user runs `/review $apply` and `apply` is a loaded skill
- **THEN** the command runs with the argument text `$apply` and carries the `apply` skill identifier

#### Scenario: Unknown mention in arguments
- **WHEN** a command argument contains `$unknown` and no loaded skill has that name
- **THEN** the argument text stays `$unknown` and carries no skill identifier
