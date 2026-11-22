# Spec Delta

## Purpose

Owns the lifecycle of a plugin-started private OpenCode 2 process and the connection to it, independent of any shared service.

## ADDED Requirements

### Requirement: OpenCode 2 executable resolution

The plugin SHALL resolve the OpenCode 2 executable from the configured path or the `opencode` command in common locations, without a shell, and SHALL treat the path as data rather than a command line.

#### Scenario: Configured path contains spaces

- **WHEN** the configured executable is installed at a valid path containing spaces
- **THEN** the plugin passes the executable and its arguments separately without evaluating the path as a shell command

#### Scenario: Resolve the opencode command

- **WHEN** no executable path is configured and `opencode` is available
- **THEN** the plugin locates and uses the `opencode` executable

#### Scenario: Executable is missing

- **WHEN** no OpenCode 2 executable can be resolved
- **THEN** the plugin reports a fixed missing-executable error and launches nothing

### Requirement: OpenCode 2 version validation

The plugin SHALL query the resolved executable version before launch and SHALL reject any executable that is not a supported OpenCode 2 release.

#### Scenario: Eligible OpenCode 2 executable

- **WHEN** the resolved executable reports a version in the supported 2.x range
- **THEN** the plugin may start the managed runtime

#### Scenario: OpenCode 1.x executable

- **WHEN** the resolved executable reports an OpenCode 1.x version
- **THEN** the plugin rejects it with a message directing the user to the OpenCode 2 executable and launches nothing

#### Scenario: Version cannot be established

- **WHEN** the version query fails or returns malformed output
- **THEN** the plugin reports a version error and launches nothing

### Requirement: Private managed endpoint

The plugin SHALL start the managed service on a loopback ephemeral port with a randomly generated password, SHALL NOT write the shared service registration, and SHALL NOT persist or log the password.

#### Scenario: Loopback endpoint with a unique password

- **WHEN** the managed runtime starts
- **THEN** it binds a loopback address on an ephemeral port with a fresh random password

#### Scenario: Shared registration is left unchanged

- **WHEN** the managed runtime starts and stops
- **THEN** the shared OpenCode service registration file is neither written nor modified

#### Scenario: Credentials stay transient

- **WHEN** the managed runtime is used
- **THEN** the service password is not saved to settings, logs, or user-visible errors

### Requirement: Managed startup policy

The plugin SHALL start the managed runtime only when discovery finds no healthy service, and SHALL NOT start it to replace a healthy, unhealthy, or incompatible shared service.

#### Scenario: No service is registered

- **WHEN** chat opens with no registered service and automatic startup is enabled
- **THEN** the plugin starts the managed runtime

#### Scenario: Registration points at a dead process

- **WHEN** discovery finds a registration whose process is no longer running and automatic startup is enabled
- **THEN** the plugin starts the managed runtime without modifying the stale registration

#### Scenario: Healthy shared service exists

- **WHEN** a healthy compatible service is already registered
- **THEN** the plugin reuses it and does not start a managed runtime

#### Scenario: Incompatible or unhealthy shared service

- **WHEN** a registered service is incompatible or unhealthy
- **THEN** the plugin reports the condition and does not silently start a managed runtime to replace it

#### Scenario: Automatic startup disabled

- **WHEN** automatic startup is disabled and no healthy service is registered
- **THEN** the plugin does not launch a process and offers discovery retry

### Requirement: Managed lifecycle ownership

The plugin SHALL start the managed runtime lazily when chat opens, keep it running while the plugin is enabled, stop its process tree on unload, restart within bounded attempts after a crash, and stop a recorded orphan before a new start.

#### Scenario: Lazy start and view independence

- **WHEN** chat opens with no healthy service and automatic startup is enabled
- **THEN** the managed runtime starts, and closing the view leaves it running while the plugin stays enabled

#### Scenario: Stop on unload

- **WHEN** the plugin is unloaded
- **THEN** the managed process tree is stopped without stopping any shared service

#### Scenario: Crash and bounded restart

- **WHEN** the managed process exits unexpectedly while the plugin is enabled
- **THEN** the plugin restarts it within bounded attempts and, after the budget is exhausted, reports an error with an explicit retry

#### Scenario: Orphan from a previous run

- **WHEN** a previously recorded managed process is still running when a new start begins
- **THEN** the plugin stops that orphan before starting a fresh process

### Requirement: Managed runtime error handling

The plugin SHALL report fixed, actionable errors for managed-runtime failures without exposing the service password or upstream secrets.

#### Scenario: Spawn or startup failure

- **WHEN** the managed runtime fails to spawn or becomes ready
- **THEN** the plugin shows a fixed error and a retry action, and no secret appears in the message
