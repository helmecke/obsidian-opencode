# Spec Delta

## ADDED Requirements

### Requirement: Consolidated composer controls
The view SHALL present the conversation selector, new-conversation action, connection and execution status, and discovery retry inside the composer region. It SHALL NOT reserve separate fixed rows above the transcript for these controls. Every control SHALL remain keyboard reachable with an accessible name, and the region SHALL wrap or compact them in narrow sidebars without hiding the status.

#### Scenario: Ready conversation
- **WHEN** the chat view is ready with a service connection
- **THEN** the composer shows the connected service mode and current execution state together with the conversation selector, new-conversation action, and Retry discovery

#### Scenario: Connection failure
- **WHEN** discovery fails or the retry budget is exhausted
- **THEN** the composer shows the failure status and enables Retry discovery in the same region, and activating it retries discovery

#### Scenario: Switch or create a conversation
- **WHEN** the user chooses a conversation from the composer selector or activates New conversation
- **THEN** the existing selection or creation flow runs and the composer remains the control surface for the conversation

#### Scenario: No separate header
- **WHEN** the chat view is rendered
- **THEN** the transcript is not preceded by a separate title, status, retry, or conversation bar

#### Scenario: Narrow sidebar
- **WHEN** the view is resized to a narrow sidebar
- **THEN** the composer meta controls wrap without horizontal scrolling and the status stays readable
