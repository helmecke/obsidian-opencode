# Spec Delta

## MODIFIED Requirements

### Requirement: Document-like transcript
The transcript SHALL read as one continuous Markdown document that inherits the host's reading surface rather than restating its typography. User prompts SHALL appear as their own labelled block in a shared reading column that follows Obsidian's **Readable line length** setting and the theme's note width, assistant answers SHALL use native reading typography and block spacing, and supporting detail SHALL appear as collapsed inline disclosures rather than framed cards.

#### Scenario: Shared reading column
- **WHEN** a transcript is displayed
- **THEN** prompts and answers share one centered reading column of note-like width while Obsidian's **Readable line length** setting is enabled, the transcript uses the pane width with the theme's note margins when that setting is off, and an assistant answer has no per-message frame or background

#### Scenario: Quoted prompt
- **WHEN** a user message is shown
- **THEN** it appears as a labelled prompt block in the reading column, with a title that names the reader, a leading icon, and the theme's callout tint; it keeps an accessible role description and still shows its pending or uncertain status

#### Scenario: Assistant document flow
- **WHEN** an assistant answer contains headings, paragraphs, lists, quotes, or code
- **THEN** those blocks use the theme's reading typography and spacing, and one spacing step governs the transcript: adjacent prose blocks, a tool or reasoning group against the prose around it, and both sides of a turn all take the theme's paragraph spacing, while a group's own rows stay tight against each other and a bulleted list shows the theme's list markers rather than the browser's default discs

#### Scenario: Reading surface inheritance
- **WHEN** a transcript is displayed in a theme or with a CSS snippet that changes reading-view text font, text size, line height, paragraph spacing, note width, or note margins
- **THEN** the transcript reflects that change without a plugin change or reload, and the chat view sets no text colour, pane background, or base font size of its own over the view content

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
