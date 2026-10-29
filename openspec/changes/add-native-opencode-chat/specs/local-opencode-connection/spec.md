# Spec Delta

## Purpose

Connect the Obsidian interface to an installed local OpenCode runtime without requiring manual CLI startup.

## ADDED Requirements

### Requirement: Lazy automatic local connection
Opening chat SHALL reuse a compatible healthy local service or start one from a separately installed OpenCode executable. Plugin loading alone SHALL NOT start the service. The plugin SHALL NOT download OpenCode or silently restart an incompatible shared service.

#### Scenario: Compatible service exists
- **WHEN** chat opens while a compatible healthy service is registered
- **THEN** the plugin connects without starting another service

#### Scenario: Service is absent
- **WHEN** chat opens with OpenCode installed but no registered running service
- **THEN** the plugin starts a compatible service without requiring manual CLI interaction

#### Scenario: Service version is incompatible
- **WHEN** the discovered shared service is outside the supported version range
- **THEN** the plugin reports the mismatch and recovery guidance without silently replacing the service

### Requirement: Actionable executable configuration
The plugin SHALL support configuring the OpenCode executable path and report missing executables, startup failures, and unsupported versions with actionable errors and an explicit retry action.

#### Scenario: Installation path contains spaces
- **WHEN** the configured executable is installed at a valid path containing spaces
- **THEN** startup treats the path as one executable rather than shell command fragments

#### Scenario: OpenCode is missing
- **WHEN** neither the default nor configured executable can be found
- **THEN** chat explains the installation or path requirement without downloading software

### Requirement: Authenticated local transport
The plugin SHALL use authenticated local service connections and SHALL NOT persist service credentials in plugin settings or expose them in logs and user-visible errors.

#### Scenario: Connect to an authenticated service
- **WHEN** service discovery supplies authentication information
- **THEN** requests use that information without asking the user to copy credentials into plugin settings

### Requirement: Current vault workspace
New sessions SHALL use the current vault root as their workspace. Session lists and applied events SHALL be scoped to that vault and the relevant session, even when the service hosts other projects.

#### Scenario: Another project emits events
- **WHEN** the shared service emits a message or interaction for an unrelated session
- **THEN** it does not appear in or change the current conversation

### Requirement: State recovery after disconnection
The plugin SHALL display connection loss, reconnect with bounded backoff, and reconcile saved messages, active execution, pending permissions, and pending forms before restoring normal interaction. Recovery SHALL NOT duplicate messages or automatically grant pending requests.

#### Scenario: Execution completes while disconnected
- **WHEN** the agent finishes and creates messages while the plugin has no event connection
- **THEN** reconnection retrieves the authoritative conversation state rather than waiting for missed events

### Requirement: Shared-service-safe cleanup
Closing the view or unloading the plugin SHALL release its subscriptions, timers, and requests as appropriate without stopping the shared service or interrupting execution merely because the UI disappeared.

#### Scenario: Disable the plugin
- **WHEN** the user disables the plugin while another OpenCode client uses the service
- **THEN** plugin-owned resources are released and the shared service remains running

### Requirement: Runtime data-flow disclosure
Documentation SHALL explain that OpenCode can read or modify files according to its permissions, may access locations outside the vault, and can send context to configured model or tool providers. The plugin SHALL NOT automatically attach editor contents or add telemetry.

#### Scenario: User reviews setup requirements
- **WHEN** the user reads the setup documentation
- **THEN** local service operation is distinguished from external provider processing and the vault is not described as a security sandbox
