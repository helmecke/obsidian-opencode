# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard and dismissal
The popover SHALL support arrow-key navigation and selection with Enter or Tab. `Escape` or focus leaving the composer SHALL close it without changing the message. While the popover is open, `Enter` SHALL confirm the highlighted command and SHALL NOT send; the next `Enter`, once the popover has closed, SHALL send.

#### Scenario: Navigate and select
- **WHEN** the popover is open and the user moves with the arrow keys and presses Enter or Tab
- **THEN** the highlighted command is inserted and the message is not sent

#### Scenario: Escape or blur closes
- **WHEN** the user presses Escape or focus leaves the composer
- **THEN** the popover closes and the composer text is unchanged

#### Scenario: Send after selecting
- **WHEN** the user confirms a command and the popover closes
- **THEN** the next Enter sends the message once with the inserted command

#### Scenario: Send while open
- **WHEN** the popover is open and the user presses Enter
- **THEN** the highlighted command is inserted instead and the message is not sent
