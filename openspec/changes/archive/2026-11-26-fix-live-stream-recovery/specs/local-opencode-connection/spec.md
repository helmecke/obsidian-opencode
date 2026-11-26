# Spec Delta

## ADDED Requirements

### Requirement: Live notifications do not interrupt the conversation
While connected and streaming, session-scoped notification events that carry no message content SHALL be applied in durable order without triggering conversation recovery, discarding the live projection, or showing a recovery error. Transcript mutations the plugin cannot model SHALL still reconcile from the authoritative snapshot.

#### Scenario: Notifications during a running answer
- **WHEN** the service emits usage counters or retry-scheduling notes while an answer streams
- **THEN** the transcript keeps streaming and the composer keeps showing the live execution state, with no recovery error and no transcript rebuild

#### Scenario: An unmodeled transcript mutation still recovers
- **WHEN** the service emits a session event that changes message content and the plugin cannot model it
- **THEN** the plugin discards the live projection and reconciles the authoritative conversation state
