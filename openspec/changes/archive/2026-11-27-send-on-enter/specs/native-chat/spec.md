# Spec Delta

## ADDED Requirements

### Requirement: Sending keys in the composer
Plain `Enter` in the message field SHALL send the message, and `Shift+Enter` SHALL be the way to add a line. `Enter` SHALL send only while the send control is enabled; in every other state it SHALL do nothing and SHALL NOT insert a newline. An `Enter` that confirms an IME composition, and an auto-repeated `Enter`, SHALL NOT send. The composer SHALL NOT offer a modifier chord for sending.

#### Scenario: Send with Enter
- **WHEN** the composer holds text and sending is available and the user presses Enter
- **THEN** the message is sent through the prompt flow and the input clears only after confirmed admission

#### Scenario: Add a line
- **WHEN** the composer has focus and the user presses Shift+Enter
- **THEN** a newline is inserted at the caret and no message is sent

#### Scenario: Sending unavailable
- **WHEN** execution is running, a prompt awaits confirmation, an interaction is busy, or the view is not ready, and the user presses Enter
- **THEN** nothing is sent, no newline is inserted, and the composer text is unchanged

#### Scenario: Empty text
- **WHEN** the message field is empty or contains only whitespace and the user presses Enter
- **THEN** nothing is sent and no newline is inserted

#### Scenario: Composing text
- **WHEN** the user presses Enter to confirm an IME composition
- **THEN** the composition is confirmed and no message is sent

#### Scenario: Held key
- **WHEN** Enter auto-repeats after a message was sent
- **THEN** no additional message is sent

#### Scenario: Modified Enter
- **WHEN** the composer has focus and the user presses Ctrl, Cmd, or Alt with Enter
- **THEN** no message is sent and the field keeps its native newline behavior
