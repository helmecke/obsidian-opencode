# Spec Delta

## ADDED Requirements

### Requirement: Subagent child navigation
A delegated subagent child session SHALL be openable from the subagent result embed in its parent transcript and SHALL open read-only without becoming a listed conversation. Activating the embed link SHALL resolve the child by its id in the current vault and switch to it; a child that cannot be resolved SHALL leave the parent conversation unchanged and show a notice. Switching with unsent composer text SHALL confirm before discarding.

#### Scenario: Open the child
- **WHEN** the user activates the link on a report whose record carries a child id that resolves to a session in the current vault
- **THEN** the view switches to that child read-only and loads its messages

#### Scenario: No link without an id
- **WHEN** a subagent result has no non-empty child id
- **THEN** its embed shows no link

#### Scenario: Unresolvable child
- **WHEN** the link's child id does not resolve to a session in the current vault
- **THEN** the view shows a notice and the parent conversation stays unchanged

#### Scenario: Unsent text
- **WHEN** the user activates the link while the composer holds unsent text
- **THEN** the view asks for confirmation before discarding that text

## MODIFIED Requirements

### Requirement: Session switcher presentation
The **Switch conversation…** item SHALL open a suggestion modal that fuzzy-matches session titles, lists only the current vault's top-level conversations, marks the current session, orders sessions by most recently updated, and refreshes the list when opened. A top-level conversation is a session with no parent; delegated subagent child sessions SHALL NOT be listed at any depth, including one open for reading, which SHALL mark no row as current. Choosing a session SHALL switch to it; cancelling SHALL leave the selection unchanged.

#### Scenario: Match and order
- **WHEN** the switcher is open
- **THEN** matching is by fuzzy title search, listed sessions are the current vault's top-level conversations, the current session is marked, and results appear newest-updated first

#### Scenario: List refreshed on open
- **WHEN** the switcher opens
- **THEN** it requests the current session list rather than reusing a stale snapshot

#### Scenario: Subagent sessions excluded
- **WHEN** the switcher lists a vault whose location holds delegated subagent child sessions
- **THEN** only top-level conversations appear, with no subagent session listed at any depth

#### Scenario: Child open marks no row
- **WHEN** a subagent child session is open for reading
- **THEN** the switcher lists top-level conversations only and marks no row as current

#### Scenario: Cancel leaves selection unchanged
- **WHEN** the user presses Escape or selects nothing and closes the switcher
- **THEN** the selected session is unchanged

### Requirement: Header breadcrumb trail
The pane header SHALL use Obsidian's native breadcrumb structure to show **opencode / sessions / title**. Activating **opencode** SHALL start a new conversation draft without creating a server session, activating **sessions** SHALL open the **Switch conversation…** switcher, and the title SHALL remain the rename surface. While a subagent child session is open, the trail SHALL append the parent conversation's title between **sessions** and the child title, and activating that parent SHALL return to the parent conversation one level at a time. While the title is edited, the parent breadcrumbs SHALL collapse as they do for a note title and return when editing ends.

#### Scenario: Start a draft from the breadcrumbs
- **WHEN** the user activates **opencode** in the header
- **THEN** a new conversation draft opens and no server session is created

#### Scenario: Open the switcher from the breadcrumbs
- **WHEN** the user activates **sessions** in the header
- **THEN** the session switcher opens

#### Scenario: Parent entry while in a child
- **WHEN** a subagent child session is open for reading
- **THEN** the trail shows **opencode / sessions / parent title** with the child title last

#### Scenario: Return to the parent
- **WHEN** the user activates the parent entry while a child is open
- **THEN** the view returns to the parent conversation and reloads its messages

#### Scenario: Collapse while renaming
- **WHEN** the user focuses the title breadcrumb
- **THEN** the parent breadcrumbs collapse and the title becomes editable, and leaving the title restores the breadcrumbs

### Requirement: Rename in place
Clicking the header title SHALL turn it into an inline text field. Committing SHALL rename the session on the server, show a notice if the rename fails, and leave the previous title in place on failure. Escape SHALL cancel, and an empty value SHALL be rejected. On a new conversation draft, the same affordance SHALL name the draft locally and apply that title when the session is created. A **Rename conversation…** item SHALL offer the same action from the document menu. A subagent child session open for reading SHALL NOT offer rename.

#### Scenario: Commit a rename
- **WHEN** the user edits the header title and commits with Enter or by leaving the field
- **THEN** the session is renamed on the server and the new title is shown

#### Scenario: Escape cancels
- **WHEN** the user edits the header title and presses Escape
- **THEN** the title reverts to its previous value and no rename is sent

#### Scenario: Empty title rejected
- **WHEN** the user commits an empty or whitespace-only title
- **THEN** no rename is sent and the previous title is kept

#### Scenario: Rename fails
- **WHEN** the server rejects or cannot process a rename
- **THEN** the view shows a notice and keeps the previous title

#### Scenario: Rename from the menu
- **WHEN** the user chooses **Rename conversation…** from the document menu
- **THEN** the same rename affordance runs against the selected session or draft

#### Scenario: Rename a draft
- **WHEN** the user edits the title of a new conversation draft and sends the first message
- **THEN** the created session keeps that title without a separate server rename before creation

#### Scenario: Rename withheld in a child
- **WHEN** a subagent child session is open for reading
- **THEN** the title is not editable and **Rename conversation…** is not offered
