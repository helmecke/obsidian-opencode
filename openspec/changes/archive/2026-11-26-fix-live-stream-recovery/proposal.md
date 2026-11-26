# Proposal

## Why

While an agent runs, the service publishes session-scoped notifications after each step (`session.usage.updated`, a cumulative cost/token counter) and before a retry (`session.retry.scheduled`). Neither carries message content, but the session reducer had no case for them, so every one was classified as an unsupported mutation, discarded the live projection, and forced a recovery reload that showed **Unable to synchronize. Retry discovery.** and rebuilt the transcript — the chat flickered for the whole run. The specs do not currently say how connected-mode notifications interact with recovery.

## What Changes

- The session reducer admits `session.usage.updated` and `session.retry.scheduled` in durable order without mutating the message projection, so they no longer trigger recovery or a recovery error during a live answer.
- Genuine transcript mutations the reducer cannot model (message content updates, compaction, and synthetic/shell/skill records) still reconcile from the authoritative snapshot.
- Two regression tests cover the admitted notifications and the retained recovery for an unsupported mutation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-opencode-connection`: adds a requirement that connected-mode session notifications do not interrupt the conversation, alongside the existing state-recovery-after-disconnection contract.

## Impact

- `src/state/session-reducer.ts`: acknowledge the two notification events.
- `tests/event-ingestion.test.mjs`: regression coverage for admitted notifications and retained recovery.
- No API, dependency, persisted setting, or privacy change.
