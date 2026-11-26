# Tasks

## 1. Reducer classification

- [x] 1.1 Acknowledge `session.usage.updated` and `session.retry.scheduled` in `SessionReducer.apply` without mutating the projection. Verify `tests/event-ingestion.test.mjs` shows no recovery request for a live batch of these events.
- [x] 1.2 Keep the snapshot-reconcile path for unmodeled transcript mutations. Verify a test asserts `session.message.content.updated` still requests `unsupported-mutation`.

## 2. Acceptance

- [ ] 2.1 In a disposable vault against an eligible service, confirm a running answer streams without the recovery error while usage counters arrive. Record the live result in `docs/runtime-compatibility.md`.
