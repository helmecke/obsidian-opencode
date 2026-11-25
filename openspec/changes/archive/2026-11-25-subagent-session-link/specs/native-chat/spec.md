# Spec Delta

## ADDED Requirements

### Requirement: Read-only subagent transcript
A delegated subagent child session opened from its report SHALL render read-only. Its transcript SHALL reuse the conversation renderer, its user records SHALL be labelled **Delegated task** instead of **You**, and its composer SHALL be empty except for one muted hint naming the parent conversation, centered horizontally and vertically. It SHALL show no input, send, stop, agent/model controls, or status row.

#### Scenario: Read-only composer
- **WHEN** a subagent child session is open for reading
- **THEN** the composer shows no input, send, stop, or agent/model controls and shows a muted hint naming the parent conversation

#### Scenario: Delegated task attribution
- **WHEN** a subagent child session's user record is shown
- **THEN** its prompt block is labelled **Delegated task** rather than **You**

#### Scenario: Hint fills the composer
- **WHEN** a subagent child session is open for reading
- **THEN** the composer contains only the muted hint, centered horizontally and vertically, with no status row

#### Scenario: Nested report link
- **WHEN** a subagent child transcript contains a subagent result embed whose record carries a child session id
- **THEN** that embed exposes the same link to open its own child read-only

## MODIFIED Requirements

### Requirement: Quiet transcript notices
The transcript SHALL omit routine successful execution records and selection-change records, SHALL show failed or interrupted execution as a compact status line, SHALL show a subagent result as an attributed, Markdown-rendered embed, and SHALL collapse the remaining injected skill, system, and synthetic text behind a short label. Shell and compaction output SHALL remain reachable. A subagent result whose record carries a child session id SHALL expose the host's native embed link in the embed frame to open that child session read-only.

#### Scenario: Successful turn
- **WHEN** execution succeeds
- **THEN** the transcript adds no success notice and the composer status carries the final execution state

#### Scenario: Failed or interrupted execution
- **WHEN** execution fails or is interrupted
- **THEN** the transcript shows a compact outcome line with the available error detail

#### Scenario: Subagent result
- **WHEN** the conversation contains a synthetic record that the service marks as a subagent result
- **THEN** the transcript shows it at its place in the conversation as a visible Markdown embed with its report Markdown-rendered in full and an embed title naming the agent and the task description

#### Scenario: Subagent result did not complete
- **WHEN** a subagent result is marked as cancelled rather than completed
- **THEN** its embed title also names the cancelled state while the available report text stays visible in the embed

#### Scenario: Subagent wrapper not shown
- **WHEN** a subagent result's text carries the service's `<subagent>` wrapper
- **THEN** the wrapper markup is absent from the rendered transcript and the embed title supplies the agent and task description instead

#### Scenario: Subagent result is identifiable
- **WHEN** a subagent result is shown
- **THEN** it exposes an accessible label naming the agent and the task description, and its text is presented as embedded material distinct from the assistant's own answer

#### Scenario: Subagent embed link
- **WHEN** a subagent result's record carries a non-empty child session id
- **THEN** its embed frame shows the host's native link affordance in the top-right corner, and activating it opens the child session read-only

#### Scenario: Injected text
- **WHEN** the conversation contains skill, system, or synthetic text that is not a subagent result
- **THEN** the transcript shows a short collapsed label and reveals the full text as plain text, never rendered as Markdown or HTML, only when expanded

#### Scenario: Shell and compaction records
- **WHEN** the conversation contains a shell or compaction record
- **THEN** the record's command and output or its summary remain available without displacing the answer
