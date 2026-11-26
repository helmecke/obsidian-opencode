# Design

## Context

`SessionReducer.apply` returns `false` for any event it cannot reduce, and `EventIngestion` reports that as `unsupported-mutation`. The synchronization coordinator treats it as uncertainty and calls `fail()`, which publishes `phase: retrying` with the generic **Unable to synchronize. Retry discovery.**, waits out the backoff, and reloads the snapshot. That is correct for a genuine unknown mutation, but wrong for periodic notifications that never touch the transcript.

## Decisions

- **Classify pure notifications in the reducer, not by a global event allowlist.** The reducer already owns the decision of whether an event mutates the projection. Adding explicit `case` labels for `session.usage.updated` and `session.retry.scheduled` keeps the classification where the reduction decision lives and still advances durable sequence tracking for the durable one.
- **Only the two content-free events are admitted.** `session.synthetic`, `session.shell.*`, `session.skill.activated`, `session.message.content.updated`, and `session.compaction.*` correspond to transcript records whose events carry no message id, so the reducer cannot construct them and they keep the snapshot-reconcile path.
- **No change to the recovery state machine.** Uncertainty (overflow, ordering, stream end) still uses `fail()` with bounded backoff; this change only stops periodic notifications from entering that path.

## Risks / Trade-offs

- A notification that later gains content (for example a `session.usage.updated` that also carried text) would be silently admitted. The schema defines it as cost/tokens only; a contract change is the trigger to revisit.
- Recovery for genuinely unmodeled mutations is still shaped like a connection failure (error and backoff). This change does not alter that; it is a separate follow-up.

## Migration

None. No persisted data, API, or schema changes.
