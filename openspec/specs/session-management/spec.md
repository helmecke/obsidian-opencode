# session-management Specification

## Purpose

Lets the user create, switch between, rename, and identify conversations from the Obsidian chat view's native chrome and document menu.

## Requirements

### Requirement: New conversation draft on open
Opening chat SHALL start a new conversation draft when no chat view is open and SHALL reveal an existing view otherwise. No OpenCode session SHALL exist until the first message is sent. All open views SHALL share one selected session or draft. A draft SHALL be locally nameable, and its title, agent, model, and thinking choices SHALL be shown, editable, and applied when the session is created.

#### Scenario: Open with no chat view
- **WHEN** the user opens chat while no chat view is open
- **THEN** the view shows an empty **New conversation** draft for the current vault and no server session exists yet

#### Scenario: First turn
- **WHEN** the user sends the first message from a new conversation draft
- **THEN** exactly one session is created for the current vault, using the draft's local title when one was set, and the message is sent to it

#### Scenario: Draft defaults
- **WHEN** a new conversation draft is shown
- **THEN** its agent, model, and thinking controls show the server's configured defaults and remain editable before the first message

#### Scenario: Default agent has no model
- **WHEN** the default agent specifies no model and no configured default model exists
- **THEN** the draft uses the last model the user selected, falling back to the server default or first enabled model

#### Scenario: Remembered model across restarts
- **WHEN** a model and variant were selected earlier and the default agent has no model
- **THEN** a new draft reuses that model and variant, including after restarting the plugin

#### Scenario: Open with a chat view open
- **WHEN** the user opens chat while a chat view is already open
- **THEN** the existing view is revealed and the selected session or draft is unchanged

#### Scenario: Shared selection
- **WHEN** two chat views are open in different panes
- **THEN** both show the same selected session or draft and stay in sync as it changes

#### Scenario: Reconnect keeps the draft
- **WHEN** the connection drops and reconnects while a new conversation draft is open
- **THEN** the same draft, including its local title, remains and no session is created

### Requirement: Resume through the session switcher
The user SHALL be able to switch to a prior conversation from the document menu. The plugin SHALL NOT restore a previously selected session on its own. Selecting a conversation SHALL load its authoritative messages; a conversation that is missing or belongs to another workspace SHALL produce a recoverable empty state rather than selecting a different conversation.

#### Scenario: Switch to a prior conversation
- **WHEN** the user picks a prior conversation in the session switcher
- **THEN** that conversation becomes the selected session and its messages are loaded without creating a duplicate

#### Scenario: Selected conversation is unavailable
- **WHEN** a selected conversation no longer exists or belongs to another workspace
- **THEN** the view shows a recoverable empty state and offers session selection or creation without silently selecting another vault's conversation

### Requirement: Session switcher presentation
The **Switch conversation…** item SHALL open a suggestion modal that fuzzy-matches session titles, lists only the current vault's top-level conversations, marks the current session, orders sessions by most recently updated, and refreshes the list when opened. A top-level conversation is a session with no parent; delegated subagent child sessions SHALL NOT be listed at any depth. Choosing a session SHALL switch to it; cancelling SHALL leave the selection unchanged.

#### Scenario: Match and order
- **WHEN** the switcher is open
- **THEN** matching is by fuzzy title search, listed sessions are the current vault's top-level conversations, the current session is marked, and results appear newest-updated first

#### Scenario: List refreshed on open
- **WHEN** the switcher opens
- **THEN** it requests the current session list rather than reusing a stale snapshot

#### Scenario: Subagent sessions excluded
- **WHEN** the switcher lists a vault whose location holds delegated subagent child sessions
- **THEN** only top-level conversations appear, with no subagent session listed at any depth

#### Scenario: Cancel leaves selection unchanged
- **WHEN** the user presses Escape or selects nothing and closes the switcher
- **THEN** the selected session is unchanged

### Requirement: Session title in the view chrome
The pane header title and the workspace tab SHALL show the current session or draft title, and an untitled session or draft SHALL show **New conversation**. A title changed elsewhere SHALL update the displayed title without reloading the transcript.

#### Scenario: Title shown in header and tab
- **WHEN** a session with a title is selected
- **THEN** both the pane header and the tab show that title rather than a fixed **OpenCode** label

#### Scenario: Untitled session or draft
- **WHEN** the selected session or draft has no title
- **THEN** the header and tab show **New conversation**

#### Scenario: External rename
- **WHEN** another client renames the selected session
- **THEN** the header and tab title update without reloading the transcript

### Requirement: Header breadcrumb trail
The pane header SHALL use Obsidian's native breadcrumb structure to show **opencode / sessions / title**. Activating **opencode** SHALL start a new conversation draft without creating a server session, activating **sessions** SHALL open the **Switch conversation…** switcher, and the title SHALL remain the rename surface. While the title is edited, the parent breadcrumbs SHALL collapse as they do for a note title and return when editing ends.

#### Scenario: Start a draft from the breadcrumbs
- **WHEN** the user activates **opencode** in the header
- **THEN** a new conversation draft opens and no server session is created

#### Scenario: Open the switcher from the breadcrumbs
- **WHEN** the user activates **sessions** in the header
- **THEN** the session switcher opens

#### Scenario: Collapse while renaming
- **WHEN** the user focuses the title breadcrumb
- **THEN** the parent breadcrumbs collapse and the title becomes editable, and leaving the title restores the breadcrumbs

### Requirement: Rename in place
Clicking the header title SHALL turn it into an inline text field. Committing SHALL rename the session on the server, show a notice if the rename fails, and leave the previous title in place on failure. Escape SHALL cancel, and an empty value SHALL be rejected. On a new conversation draft, the same affordance SHALL name the draft locally and apply that title when the session is created. A **Rename conversation…** item SHALL offer the same action from the document menu.

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

### Requirement: Switching during execution
The user SHALL be able to switch sessions while the current session is executing, and closing the chat view SHALL NOT interrupt execution. Switching with unsent composer text SHALL confirm before discarding that text.

#### Scenario: Switch while executing
- **WHEN** the user switches to another session while the current one is executing
- **THEN** the execution continues in the background and the newly selected session shows its own state

#### Scenario: Close during execution
- **WHEN** the user closes the chat view while a session is executing
- **THEN** execution continues and the conversation is recoverable when reopened or selected again

#### Scenario: Confirm before discarding a draft
- **WHEN** the user switches sessions while the composer holds unsent text
- **THEN** the view asks for confirmation before discarding that text
