# Spec Delta

## MODIFIED Requirements

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
