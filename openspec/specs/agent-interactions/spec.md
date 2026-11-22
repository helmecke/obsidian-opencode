# agent-interactions Specification

## Purpose

Keep OpenCode's tool activity and required human decisions usable inside the native Obsidian conversation.

## Requirements

### Requirement: Inspectable tool activity
The conversation SHALL show compact tool activity with expandable available details, distinguishing running, successful, and failed calls without injecting tool output as executable UI code.

#### Scenario: Tool fails
- **WHEN** a tool call reports failure
- **THEN** the view retains an inspectable failed entry and distinguishes it from successful calls and the overall execution state

### Requirement: Respect configured permissions
The plugin SHALL preserve OpenCode's configured permission policy and SHALL NOT silently approve requests or rewrite permission configuration. Pending requests SHALL show their action and resources and offer explicit allow-once, persistent-allow, and reject decisions with the persistent scope made clear.

#### Scenario: Approve once
- **WHEN** the user allows a pending request once
- **THEN** the plugin submits the one-time decision without converting it into a persistent grant

#### Scenario: Persist an approval
- **WHEN** the user explicitly selects persistent approval
- **THEN** the UI identifies the server-provided scope being saved before submitting the persistent decision

#### Scenario: Reject a request
- **WHEN** the user rejects a permission request
- **THEN** the plugin submits rejection and reflects the server-confirmed outcome

### Requirement: Structured agent forms
The view SHALL render pending OpenCode forms with their supported text, choice, multiselect, numeric, boolean, and external-link fields, including required fields and visibility conditions. Users SHALL be able to submit or cancel a form. External links SHALL open only on explicit user action.

#### Scenario: Answer a choice and free-text form
- **WHEN** the agent requests a form containing choices and text input
- **THEN** the user can complete the visible required fields and submit an answer to that form

#### Scenario: Conditional fields
- **WHEN** an answer changes a form's field visibility conditions
- **THEN** the view updates visible fields and validates the applicable required inputs before submission

#### Scenario: Unsupported field arrives
- **WHEN** a server sends a field type unsupported by the installed plugin
- **THEN** the view reports the incompatibility without silently submitting an incomplete answer

### Requirement: Race-safe interaction reconciliation
Pending interactions SHALL be restored after reopening or reconnecting. Decisions SHALL remain pending until confirmed; requests already settled by another client SHALL be reconciled without duplicate decisions or false success indications.

#### Scenario: Another client answers first
- **WHEN** a permission or form displayed in Obsidian has already been settled elsewhere
- **THEN** submission or refreshed state removes the stale controls and shows the current server state

#### Scenario: Reply transmission fails
- **WHEN** a form or permission reply fails without a confirmed outcome
- **THEN** the plugin refreshes its state and offers retry only if the interaction is still pending
