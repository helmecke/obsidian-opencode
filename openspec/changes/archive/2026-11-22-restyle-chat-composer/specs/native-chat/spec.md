# Spec Delta

## ADDED Requirements

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
