# Spec Delta

## ADDED Requirements

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
- **WHEN** an assistant message contains reasoning or tool activity
- **THEN** reasoning and tool activity appear as collapsed single-line disclosures inside the document flow that expand on request without adding a framed widget

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

## MODIFIED Requirements

### Requirement: Streamed message composition
The view SHALL offer multiline message input, explicit sending, incremental response display, and visible connection and execution states. A failed or uncertain send SHALL retain recoverable input and SHALL NOT be automatically resent with a new identity.

#### Scenario: Receive an answer
- **WHEN** the user sends a message to a ready session
- **THEN** the view shows the submitted message and incremental answer text, and its final execution state remains visible in the composer status

#### Scenario: Acknowledgment is lost
- **WHEN** the connection fails before the plugin can confirm message admission
- **THEN** the view indicates the uncertain result and reconciles server state before offering a safe retry
