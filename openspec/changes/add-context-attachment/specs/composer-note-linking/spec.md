# Spec Delta

## MODIFIED Requirements

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
