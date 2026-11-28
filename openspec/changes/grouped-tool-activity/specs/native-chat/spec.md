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
- **THEN** those blocks use the theme's reading typography and spacing, and one spacing step governs the transcript: adjacent prose blocks, an activity group against the prose around it, and both sides of a turn all take the theme's paragraph spacing, while a group's own rows stay tight against each other and a bulleted list shows the theme's list markers rather than the browser's default discs

#### Scenario: Reading surface inheritance
- **WHEN** a transcript is displayed in a theme or with a CSS snippet that changes reading-view text font, text size, line height, paragraph spacing, note width, or note margins
- **THEN** the transcript reflects that change without a plugin change or reload, and the chat view sets no text colour, pane background, or base font size of its own over the view content

#### Scenario: Supporting detail stays quiet
- **WHEN** an assistant message contains tool activity, or contains reasoning while **Show reasoning** is enabled
- **THEN** that activity appears as collapsed inline disclosures inside the document flow: a phase group as one line and a group of one drawn row as that tool's row, each expanding on request without adding a framed widget

#### Scenario: Reasoning hidden
- **WHEN** an assistant message contains reasoning while **Show reasoning** is disabled
- **THEN** the transcript omits the reasoning disclosure entirely and keeps the answer text and tool activity visible

#### Scenario: Fold affordance
- **WHEN** a group, reasoning, or tool disclosure is shown
- **THEN** its summary shows a muted leading icon, and hovering or focusing the summary replaces it with a chevron that points down while the disclosure is open

#### Scenario: Assistant context
- **WHEN** an assistant run carries a model, agent, or elapsed duration
- **THEN** one faint, footnote-like line at the end shows the available values together and omits any value the run does not provide

### Requirement: Reasoning visibility setting
The plugin SHALL provide a **Show reasoning** setting that is off by default. While it is off, reasoning SHALL be absent from the transcript. Changing the setting SHALL update an open chat view without a plugin reload or conversation reselection.

#### Scenario: Default off
- **WHEN** the plugin runs with no stored choice for **Show reasoning**, including a new install or an existing install upgraded from a version without the setting
- **THEN** the transcript shows no reasoning row, icon, preview, or body for live or restored conversations

#### Scenario: Opt in
- **WHEN** the user enables **Show reasoning**
- **THEN** reasoning appears in the open transcript as collapsed disclosures; a thought beside an open activity group joins that group as a nested row, a thought with no open group keeps its own row, and every non-reasoning part keeps its current presentation

#### Scenario: Disable while open
- **WHEN** the user disables **Show reasoning** while an open transcript shows reasoning
- **THEN** the reasoning rows disappear from that view immediately, activity groups keep their tool rows and counts, a group left with one drawn row becomes that tool's row, and the answer text, footnotes, notices, and execution status remain

## ADDED Requirements

### Requirement: Grouped tool activity
Tool calls in one assistant message SHALL form contiguous phase groups: explore, edit, run or other. Same-phase neighbours SHALL merge, and up to five look-ups SHALL fold into the adjacent edit or run. A group with more than one drawn row SHALL appear as one collapsed line naming what it did; a group with one drawn row SHALL remain that tool's row.

#### Scenario: A long message reads as phases
- **WHEN** an assistant message contains a run of reads, then edits, then shell calls
- **THEN** the transcript shows one explore group, one edit group, and one run group, with every tool row inside its phase group and in its original order

#### Scenario: Look-ups fold into work
- **WHEN** up to five look-ups sit immediately before an edit or immediately after an edit or run
- **THEN** those look-ups join that group and its line counts the files they read
- **WHEN** more than five look-ups stand alone
- **THEN** they form their own explore group

#### Scenario: Summary line
- **WHEN** a group line is shown
- **THEN** it names what the group did in this order: unique files changed with their `+A −D` totals, failed calls, commands run, files read, `explored`, and `searched the web`, using singular or plural wording; a group with no counted work says `N steps`

#### Scenario: Incomplete diff totals
- **WHEN** a changed-file call does not report complete additions and deletions
- **THEN** the group line keeps the file count and omits the `+A −D` totals rather than showing a partial sum

#### Scenario: One call stands alone
- **WHEN** a group contains one drawn row, live or settled
- **THEN** no group line is shown and the tool row appears directly, with its own status and disclosure

#### Scenario: Grouping is always on
- **WHEN** any transcript is rendered
- **THEN** grouping applies without a new setting, mode, or stored choice

### Requirement: Live activity window
While an assistant message is unfinished, its newest activity group SHALL stay open and show only its last seven nested rows. The window SHALL pause while the reader is scrolled away from the bottom or focused inside the group. When the message finishes, the group SHALL fold unless the reader opened it.

#### Scenario: Window while running
- **WHEN** the newest group of an unfinished assistant message contains more than seven nested rows
- **THEN** the group is open, its last seven rows are shown, older rows are absent from the document, and its line still summarises the whole group

#### Scenario: Window pauses for the reader
- **WHEN** the reader scrolls away from the transcript bottom or focus sits inside the live group
- **THEN** rows stop dropping from the window until the reader returns to the bottom and focus leaves the group

#### Scenario: Settling
- **WHEN** the assistant message finishes and the reader has not opened the group
- **THEN** the group folds to its line
- **WHEN** the reader opened the group
- **THEN** it stays open with every row available

#### Scenario: One row in a live group
- **WHEN** the live group would contain only one drawn row
- **THEN** it still reads as that tool's row with its running status, never as a header above one row

### Requirement: Activity group failures
An activity group line SHALL name failed calls in the error colour, and a group containing a failure SHALL stay folded like any other settled group. The failing tool's row SHALL keep its error status and detail for when the group is opened.

#### Scenario: Failure in the line
- **WHEN** a group contains failed calls
- **THEN** its line includes the failed count in the error colour, and opening the group shows each failed row with its error detail

#### Scenario: No auto-open
- **WHEN** a settled group contains a failure
- **THEN** the group stays folded and the failure remains visible in its line

#### Scenario: Failure while running
- **WHEN** a call in the live group fails while the message is unfinished
- **THEN** the group stays open under the live window, the failed row shows its error status, and the line reflects the failure

### Requirement: Activity group boundaries
Text SHALL end an activity group, reasoning SHALL join an open group or stand alone, and delegation and question calls SHALL stay outside groups. Each group line SHALL show its phase icon at rest and a chevron on hover, focus or open, with an accessible name carrying the summary.

#### Scenario: Text breaks a group
- **WHEN** text appears between two runs of tool calls in one assistant message
- **THEN** the transcript shows a group before the text and a separate group after it

#### Scenario: Reasoning joins work
- **WHEN** **Show reasoning** is enabled and a thought sits between tool calls in an open group
- **THEN** the thought is a nested row in that group, and a thought with no open group keeps its own row

#### Scenario: Standalone calls
- **WHEN** a delegation or question call appears between tool runs
- **THEN** it keeps its own row outside any group, splits the surrounding runs, and its counts do not enter an adjacent group line

#### Scenario: Phase affordance
- **WHEN** a group line is rendered
- **THEN** explore shows `search`, edit shows `file-diff`, run shows `terminal` and other shows `wrench` at rest, hovering or focusing replaces the icon with a chevron, and an accessible name carries the line's summary
