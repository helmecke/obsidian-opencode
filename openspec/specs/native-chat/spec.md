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
- **THEN** the view shows the submitted message and incremental answer text, and its final execution state remains visible in the composer status

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

### Requirement: Document-like transcript
The transcript SHALL read as one continuous Markdown document in the active Obsidian theme. User prompts SHALL appear as quoted asides in a shared reading column that follows Obsidian's **Readable line length** setting and the theme's note width, assistant answers SHALL use native reading typography and block spacing, and supporting detail SHALL appear as collapsed inline disclosures rather than framed cards.

#### Scenario: Shared reading column
- **WHEN** a transcript is displayed
- **THEN** prompts and answers share one centered reading column of note-like width while Obsidian's **Readable line length** setting is enabled, the transcript uses the pane width when that setting is off, and an assistant answer has no per-message frame or background

#### Scenario: Quoted prompt
- **WHEN** a user message is shown
- **THEN** it appears as a quoted aside in the reading column rather than a right-aligned bubble, keeps an accessible role description, and still shows its pending or uncertain status

#### Scenario: Assistant document flow
- **WHEN** an assistant answer contains headings, paragraphs, lists, quotes, or code
- **THEN** those blocks use native Markdown typography and block spacing, with no extra gap between individual parts and space added only between turns

#### Scenario: Supporting detail stays quiet
- **WHEN** an assistant message contains tool activity, or contains reasoning while **Show reasoning** is enabled
- **THEN** that activity appears as a collapsed single-line disclosure inside the document flow that expands on request without adding a framed widget

#### Scenario: Reasoning hidden
- **WHEN** an assistant message contains reasoning while **Show reasoning** is disabled
- **THEN** the transcript omits the reasoning disclosure entirely and keeps the answer text and tool activity visible

#### Scenario: Fold affordance
- **WHEN** a reasoning or tool disclosure is shown
- **THEN** its summary shows a muted leading icon, and hovering or focusing the summary replaces it with a chevron that points down while the disclosure is open

#### Scenario: Assistant context
- **WHEN** an assistant run carries a model, agent, or elapsed duration
- **THEN** one faint, footnote-like line at the end shows the available values together and omits any value the run does not provide

### Requirement: Composer shares the reading measure
The composer card SHALL share the transcript's centered reading column while Obsidian's **Readable line length** setting is enabled, and SHALL use the pane width when it is off.

#### Scenario: Readable line length
- **WHEN** the chat is displayed with **Readable line length** enabled
- **THEN** the composer card aligns with the transcript's reading column instead of spanning the pane, and spans the pane when the setting is off

### Requirement: Quiet transcript notices
The transcript SHALL omit routine successful execution records and selection-change records, SHALL show failed or interrupted execution as a compact status line, and SHALL collapse injected skill, system, and synthetic text behind a short label. Shell and compaction output SHALL remain reachable.

#### Scenario: Successful turn
- **WHEN** execution succeeds
- **THEN** the transcript adds no success notice and the composer status carries the final execution state

#### Scenario: Failed or interrupted execution
- **WHEN** execution fails or is interrupted
- **THEN** the transcript shows a compact outcome line with the available error detail

#### Scenario: Injected text
- **WHEN** the conversation contains skill, system, or synthetic text
- **THEN** the transcript shows a short collapsed label and reveals the full text only when expanded

#### Scenario: Shell and compaction records
- **WHEN** the conversation contains a shell or compaction record
- **THEN** the record's command and output or its summary remain available without displacing the answer

### Requirement: Reasoning visibility setting
The plugin SHALL provide a **Show reasoning** setting that is off by default. While it is off, reasoning SHALL be absent from the transcript. Changing the setting SHALL update an open chat view without a plugin reload or conversation reselection.

#### Scenario: Default off
- **WHEN** the plugin runs with no stored choice for **Show reasoning**, including a new install or an existing install upgraded from a version without the setting
- **THEN** the transcript shows no reasoning row, icon, preview, or body for live or restored conversations

#### Scenario: Opt in
- **WHEN** the user enables **Show reasoning**
- **THEN** reasoning appears in the open transcript and in later answers as collapsed disclosures, while every non-reasoning part keeps its current presentation

#### Scenario: Disable while open
- **WHEN** the user disables **Show reasoning** while an open transcript shows reasoning
- **THEN** the reasoning rows disappear from that view immediately and the answer text, tool activity, footnotes, notices, and execution status remain
