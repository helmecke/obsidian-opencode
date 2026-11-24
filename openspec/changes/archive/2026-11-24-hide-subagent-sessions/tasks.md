# Tasks

## 1. Top-level-only session list

- [x] 1.1 In `src/opencode/sessions.ts`, make `listAt` skip any page entry whose
  `parentID` is set, leaving the directory filter, dedupe, and cursor walk
  unchanged; verify with `npm test` that existing list, switcher, and selection
  tests still pass.
- [x] 1.2 Extend `tests/sessions.test.mjs` and `tests/session-switcher.test.mjs`
  with a child-session record at the vault directory, and assert that
  `SessionCoordinator.list()` and the switcher omit it at any depth while its
  parent stays listed, newest-updated first; verify with `npm test`.
- [x] 1.3 Add an Unreleased `CHANGELOG.md` bullet stating that **Switch
  conversation…** lists only the vault's top-level conversations and no longer
  offers delegated subagent sessions; verify the entry reads as user-facing copy
  without internal names.

## 2. Live and full checks

- [x] 2.1 In the disposable test vault, run one real delegated subagent, open
  **Switch conversation…**, and confirm the child session is absent while its
  parent is listed and the report still appears as an embed in the transcript;
  record the run, its date, and any limitation in
  `docs/runtime-compatibility.md`.
- [x] 2.2 Run `npm test`, `npm run build`, and `npm run lint` and confirm all
  three pass.

## Workflow follow-up

- Review the result, then archive the change so
  `openspec/specs/session-management/spec.md` receives the updated switcher
  requirement.
