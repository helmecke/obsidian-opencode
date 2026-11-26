# local-opencode-connection Specification

## Purpose

Connect the Obsidian interface to an already-running local OpenCode service without taking ownership of its lifecycle.

## Requirements

### Requirement: Lazy local service discovery and reuse
Opening chat SHALL discover and reuse a compatible healthy already-running local service. Plugin loading alone SHALL NOT contact the service. The plugin SHALL NOT download OpenCode or restart or replace an incompatible shared service. When no healthy service is registered and automatic startup is enabled, the plugin MAY start and own a private managed OpenCode 2 runtime as specified by the managed-opencode-runtime capability.

#### Scenario: Compatible service exists
- **WHEN** chat opens while a compatible healthy service is registered
- **THEN** the plugin connects without starting another service

#### Scenario: Service is absent
- **WHEN** chat opens with no registered running service and automatic startup is enabled
- **THEN** the plugin starts the managed runtime

#### Scenario: Service is absent and automatic startup is disabled
- **WHEN** chat opens with no registered running service and automatic startup is disabled
- **THEN** the plugin explains that no service is available with explicit discovery retry and no process launch
- **AND** the user can start OpenCode outside Obsidian and retry

#### Scenario: Service version is outside the eligible range
- **WHEN** the discovered shared service is outside the supported version range
- **THEN** the plugin reports the mismatch and recovery guidance without silently replacing the service

### Requirement: Version eligibility and API compatibility
The plugin SHALL use a documented, validated OpenCode 2.x eligibility range rather than exact-version equality. Documentation SHALL distinguish eligible versions from individually tested releases. Eligible services SHALL also satisfy the required registration, authentication, API, and event contracts; incompatible contracts SHALL produce actionable errors without enabling unsafe sends or decisions or replacing the shared service.

#### Scenario: Compatible newer 2.x service
- **WHEN** an eligible newer 2.x service satisfies the required contracts
- **THEN** the plugin allows connection without requiring its version to equal the bundled client's version

#### Scenario: Eligible service has an incompatible API
- **WHEN** initial synchronization with an eligible service encounters an unsupported required endpoint or incompatible required response
- **THEN** the plugin reports API incompatibility and keeps sends and decisions disabled rather than presenting a successful empty conversation
- **AND** the plugin leaves service registration, configuration, and process ownership unchanged

#### Scenario: Version metadata cannot establish eligibility
- **WHEN** service version metadata is missing, malformed, or excluded by the documented prerelease policy
- **THEN** the plugin reports version incompatibility with recovery guidance and does not treat the result as service absence

### Requirement: Shared-service ownership preservation
The plugin SHALL leave shared service registration, configuration, and process ownership unchanged, including when discovery fails, another service appears, or a managed runtime is started or stopped.

#### Scenario: Another service appears during discovery
- **WHEN** another service changes the registration while the plugin is discovering a service
- **THEN** the plugin rejects the changed identity and allows discovery retry without overwriting registration, stopping, or replacing a service

#### Scenario: Registration cannot be trusted
- **WHEN** registration is malformed, unreadable, unauthenticated, unhealthy, or incompatible
- **THEN** the plugin reports the error without interpreting it as permission to launch or replace a service

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

### Requirement: Live notifications do not interrupt the conversation
While connected and streaming, session-scoped notification events that carry no message content SHALL be applied in durable order without triggering conversation recovery, discarding the live projection, or showing a recovery error. Transcript mutations the plugin cannot model SHALL still reconcile from the authoritative snapshot.

#### Scenario: Notifications during a running answer
- **WHEN** the service emits usage counters or retry-scheduling notes while an answer streams
- **THEN** the transcript keeps streaming and the composer keeps showing the live execution state, with no recovery error and no transcript rebuild

#### Scenario: An unmodeled transcript mutation still recovers
- **WHEN** the service emits a session event that changes message content and the plugin cannot model it
- **THEN** the plugin discards the live projection and reconciles the authoritative conversation state
