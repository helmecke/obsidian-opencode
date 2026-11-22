# Spec Delta

## MODIFIED Requirements

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

### Requirement: Shared-service ownership preservation

The plugin SHALL leave shared service registration, configuration, and process ownership unchanged, including when discovery fails, another service appears, or a managed runtime is started or stopped.

#### Scenario: Another service appears during discovery

- **WHEN** another service changes the registration while the plugin is discovering a service
- **THEN** the plugin rejects the changed identity and allows discovery retry without overwriting registration, stopping, or replacing a service

#### Scenario: Registration cannot be trusted

- **WHEN** registration is malformed, unreadable, unauthenticated, unhealthy, or incompatible
- **THEN** the plugin reports the error without interpreting it as permission to launch or replace a service

## REMOVED Requirements

### Requirement: Inactive executable configuration

**Reason**: The executable-path setting becomes active for the managed runtime, so it is no longer a future-only placeholder.

**Migration**: Executable resolution and OpenCode 2 version validation are now specified by the managed-opencode-runtime capability. Path-data preservation and settings input validation remain in the settings handling.
