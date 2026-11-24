# Spec Delta

## MODIFIED Requirements

### Requirement: Quiet transcript notices
The transcript SHALL omit routine successful execution records and selection-change records, SHALL show failed or interrupted execution as a compact status line, SHALL show a subagent result as an attributed, Markdown-rendered embed, and SHALL collapse the remaining injected skill, system, and synthetic text behind a short label. Shell and compaction output SHALL remain reachable.

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

#### Scenario: Injected text
- **WHEN** the conversation contains skill, system, or synthetic text that is not a subagent result
- **THEN** the transcript shows a short collapsed label and reveals the full text as plain text, never rendered as Markdown or HTML, only when expanded

#### Scenario: Shell and compaction records
- **WHEN** the conversation contains a shell or compaction record
- **THEN** the record's command and output or its summary remain available without displacing the answer
