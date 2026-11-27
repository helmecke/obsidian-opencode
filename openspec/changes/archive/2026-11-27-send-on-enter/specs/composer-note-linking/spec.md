# Spec Delta

## MODIFIED Requirements

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
