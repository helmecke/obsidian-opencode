# Spec Delta

## Purpose

Provide an Obsidian-native interface for OpenCode conversations without requiring a terminal or switching applications.

## ADDED Requirements

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
