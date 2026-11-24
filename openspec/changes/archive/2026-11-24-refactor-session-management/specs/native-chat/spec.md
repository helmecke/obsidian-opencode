# Spec Delta

## MODIFIED Requirements

### Requirement: Consolidated composer controls
The view SHALL present the connection and execution status and discovery retry inside the composer region. It SHALL NOT reserve separate fixed rows above the transcript for these controls, and conversation switching, creation, and renaming SHALL be offered through the view's document menu instead of the composer. Every control SHALL remain keyboard reachable with an accessible name, and the region SHALL wrap or compact them in narrow sidebars without hiding the status.

#### Scenario: Ready conversation
- **WHEN** the chat view is ready with a service connection
- **THEN** the composer shows the connected service mode and current execution state together with Retry discovery

#### Scenario: Connection failure
- **WHEN** discovery fails or the retry budget is exhausted
- **THEN** the composer shows the failure status and enables Retry discovery in the same region, and activating it retries discovery

#### Scenario: Switch or create a conversation
- **WHEN** the user chooses **Switch conversation…** or **New conversation** from the document menu
- **THEN** the session selection or new-conversation draft flow runs and the composer remains the control surface for the conversation

#### Scenario: No separate header
- **WHEN** the chat view is rendered
- **THEN** the transcript is not preceded by a separate title, status, retry, or conversation bar

#### Scenario: Narrow sidebar
- **WHEN** the view is resized to a narrow sidebar
- **THEN** the composer status and retry controls wrap without horizontal scrolling and the status stays readable

## REMOVED Requirements

### Requirement: Persistent conversation selection
**Reason**: Replaced by the session-management capability, which opens a new conversation draft and resumes conversations through the document-menu switcher instead of restoring the last selected conversation.

**Migration**: Use **Switch conversation…** in the document menu to resume a prior conversation.
