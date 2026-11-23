# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
