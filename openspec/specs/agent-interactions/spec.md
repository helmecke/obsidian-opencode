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
The view SHALL render each pending OpenCode form as an Obsidian question callout with its title, supported text, choice, multiselect, numeric, boolean, and external-link fields, required markers, and visibility conditions. Choice fields SHALL present selectable option rows with any per-option description, mark a recommended option, and offer a revealed custom-answer row. Users SHALL be able to submit or cancel a form. External links SHALL open only on explicit user action.

#### Scenario: Answer a choice and free-text form
- **WHEN** the agent requests a form containing choices and text input
- **THEN** the user can select an option row, complete the visible required fields, and submit an answer to that form

#### Scenario: Conditional fields
- **WHEN** an answer changes a form's field visibility conditions
- **THEN** the view updates visible fields and validates the applicable required inputs before submission

#### Scenario: Unsupported field arrives
- **WHEN** a server sends a field type unsupported by the installed plugin
- **THEN** the view reports the incompatibility without silently submitting an incomplete answer

#### Scenario: Option descriptions and a recommended choice
- **WHEN** a choice field carries per-option descriptions and an option labelled as recommended
- **THEN** each option appears as a selectable row with its description beneath the label, and the recommended option shows a recommended marker without the marker text repeating in its label

#### Scenario: Custom answer row
- **WHEN** a choice field allows a custom answer
- **THEN** the card offers an Other row that reveals a text field when selected, and the entered value is submitted as that field's answer

### Requirement: Race-safe interaction reconciliation
Pending interactions SHALL be restored after reopening or reconnecting. Decisions SHALL remain pending until confirmed; requests already settled by another client SHALL be reconciled without duplicate decisions or false success indications.

#### Scenario: Another client answers first
- **WHEN** a permission or form displayed in Obsidian has already been settled elsewhere
- **THEN** submission or refreshed state removes the stale controls and shows the current server state

#### Scenario: Reply transmission fails
- **WHEN** a form or permission reply fails without a confirmed outcome
- **THEN** the plugin refreshes its state and offers retry only if the interaction is still pending

### Requirement: Pending decisions follow the reading measure
While Obsidian's **Readable line length** setting is enabled, pending permission and question cards SHALL share the chat's centered reading column. With the setting off, they SHALL use the pane width. The interaction dock SHALL NOT draw a full-width divider above its cards.

#### Scenario: Readable line length with a pending question
- **WHEN** a question is pending while **Readable line length** is enabled
- **THEN** the question card aligns with the composer and transcript column, and no horizontal rule spans the interaction dock

### Requirement: Pending decisions keep the live transcript
While a question or permission is pending, the conversation SHALL keep its current transcript and continue receiving updates. Only a confirmed session deletion SHALL clear the selection and transcript.

#### Scenario: A question arrives mid-conversation
- **WHEN** a new form arrives for the selected conversation
- **THEN** the existing messages stay visible and live updates continue while the form waits for an answer
