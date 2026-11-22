# native-chat Specification

## Purpose

Provide an Obsidian-native interface for OpenCode conversations without requiring a terminal or switching applications.

## Requirements

### Requirement: Native movable chat view
The plugin SHALL expose chat as a regular desktop Obsidian view, reachable through a command and ribbon action, using the active theme and keyboard-accessible controls rather than a terminal or embedded external application.

#### Scenario: Open and move chat
- **WHEN** the user opens chat and moves it between a main tab and a sidebar
- **THEN** the conversation remains usable and adopts the active Obsidian theme in both locations

### Requirement: Persistent conversation selection
The user SHALL be able to create a conversation and list and resume conversations belonging to the current vault. The plugin SHALL restore the last selected conversation when it remains available and present a recoverable empty state otherwise.

#### Scenario: Reopen a conversation
- **WHEN** the user reopens chat after selecting a conversation previously
- **THEN** its saved messages are restored without creating a duplicate conversation

#### Scenario: Previous conversation is unavailable
- **WHEN** the saved conversation no longer exists or belongs to another workspace
- **THEN** the plugin offers conversation selection or creation without silently selecting another vault's conversation

### Requirement: Streamed message composition
The view SHALL offer multiline message input, explicit sending, incremental response display, and visible connection and execution states. A failed or uncertain send SHALL retain recoverable input and SHALL NOT be automatically resent with a new identity.

#### Scenario: Receive an answer
- **WHEN** the user sends a message to a ready session
- **THEN** the view shows the submitted message and incremental answer text followed by its final execution state

#### Scenario: Acknowledgment is lost
- **WHEN** the connection fails before the plugin can confirm message admission
- **THEN** the view indicates the uncertain result and reconciles server state before offering a safe retry

### Requirement: Agent and model selection
The view SHALL display the session's selected agent and model and allow selecting alternatives available from OpenCode. Failed changes SHALL preserve or restore the server-confirmed selection and display an error.

#### Scenario: Change the agent
- **WHEN** the user chooses an available agent
- **THEN** the session selection is updated and subsequent execution uses the confirmed selection

#### Scenario: Change the model
- **WHEN** the user chooses an available model
- **THEN** the session selection is updated and subsequent execution uses the confirmed selection

### Requirement: Explicit execution interruption
The view SHALL provide a stop action for active execution. Closing or moving the chat view SHALL NOT itself interrupt execution, and reopening SHALL recover the conversation's current state.

#### Scenario: Close during execution
- **WHEN** the user closes chat while the agent is executing
- **THEN** execution continues and reopening chat displays its current or completed state

#### Scenario: Stop execution
- **WHEN** the user activates stop during execution
- **THEN** the plugin requests server-side interruption and reports the resulting state without deleting existing messages

### Requirement: Unified composer card
The view SHALL present the message field, send action, agent selector, model selector, and any active-execution stop action within one visually unified composer region below the conversation. The region SHALL use the active Obsidian theme, keep every control reachable by keyboard with an accessible name, and wrap or compact its controls so they remain usable in narrow sidebars. It SHALL NOT render controls for features the plugin does not support.

#### Scenario: Compose and send from the card
- **WHEN** a ready conversation is selected, the user enters text, and the user activates the send control
- **THEN** the message is sent through the existing prompt flow, uncertainty is reported within the composer region, and the input clears only after confirmed admission

#### Scenario: Narrow sidebar
- **WHEN** the chat view is resized to a narrow sidebar
- **THEN** every composer control remains reachable without horizontal scrolling and is identified by an accessible name or tooltip

#### Scenario: No inert controls
- **WHEN** the composer is rendered
- **THEN** it shows no attachment, voice, shield, or command/skill controls that lack working behavior

#### Scenario: Execution state changes
- **WHEN** execution starts or finishes
- **THEN** the stop control becomes available or unavailable inside the composer without moving the message field or selectors

#### Scenario: Theme change
- **WHEN** the user switches between light and dark themes
- **THEN** the composer card, its controls, and focus indicators adopt the active theme and remain legible
