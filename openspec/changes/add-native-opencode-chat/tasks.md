# Tasks

## 1. Runtime compatibility gate

- [x] 1.1 Pin the v2 client dependency and add a lightweight automated test command; verify npm installation, client/service imports, and the existing production bundle succeed without unbundled runtime package dependencies.
- [x] 1.2 Validate service discovery, authenticated requests, and streamed events in the target Obsidian Electron runtime using an agreed disposable test vault; record tested OpenCode/Obsidian versions and transport choice in developer documentation, and stop for design revision if the local client approach fails.
- [x] 1.3 Define and test a concrete supported OpenCode version range and non-destructive incompatibility handling; verify a mock incompatible shared service is never restarted or replaced.

## 2. Plugin shell and local connection

- [ ] 2.1 Replace sample identity and demo actions with desktop-only OpenCode metadata, a registered native view, ribbon action, and stable open-chat command; verify build/lint and that enabling the plugin alone does not start a service.
- [ ] 2.2 Implement lazy deduplicated connection setup and executable-path settings using transient discovered authentication; verify tests cover service reuse, startup, missing executable, paths with spaces, startup failure, retry, and secret redaction.
- [ ] 2.3 Implement connection and view cleanup without stopping the shared service or interrupting execution; verify lifecycle tests cover concurrent opens, close/reopen, and plugin unload.
- [ ] 2.4 Document installation, executable-path configuration, supported versions, provider data flow, permissions, and shared-service ownership in README; verify instructions match implemented settings and do not describe the vault as a sandbox.

## 3. Session state and recovery

- [ ] 3.1 Add current-vault session creation, scoped listing, selection persistence, and authoritative message loading; verify tests cover multiple projects, unavailable saved sessions, reopen, and no duplicate session creation.
- [ ] 3.2 Implement fast event ingestion and session-scoped state reduction with bounded queues; verify fixture tests for text deltas, execution states, unrelated events, duplicate events, and queue overflow.
- [ ] 3.3 Implement initial synchronization and reconnect with buffered events, snapshot reconciliation, bounded backoff, and explicit retry; verify deterministic tests cover events during snapshot loading, missed completion, pending interactions, and unload during retry.
- [ ] 3.4 Implement stable prompt identity and uncertain-send reconciliation; verify lost-acknowledgment tests retain recoverable input and never duplicate admitted messages on retry.
- [ ] 3.5 Document conversation persistence and connection recovery behavior; verify the documented states correspond to tested state transitions.

## 4. Native conversation controls

- [ ] 4.1 Build the theme-aware conversation layout, multiline composer, incremental messages, and visible connection/execution errors; verify component tests and manual keyboard use in both main-tab and sidebar layouts.
- [ ] 4.2 Add conversation selection and creation controls connected to vault-scoped state; verify selecting and reopening conversations shows authoritative messages without leaking another vault's state.
- [ ] 4.3 Add server-backed agent/model selectors and explicit stop using session interruption; verify tests cover confirmed changes, failed changes, active interruption, and closing the view without interruption.
- [ ] 4.4 Document the controls and close-versus-stop behavior in README; verify an in-Obsidian walkthrough follows the documented workflow.

## 5. Markdown and wikilink navigation

- [ ] 5.1 Add batched Obsidian Markdown rendering with managed component lifetimes; verify render tests and manual checks for split streamed markup, code blocks, inline code, final rendering, and repeated view disposal.
- [ ] 5.2 Route internal links through Obsidian resolution and non-chat-leaf navigation with stable vault-root context; verify routing tests plus manual alias, path, heading, block, and duplicate-basename checks in the disposable vault.
- [ ] 5.3 Implement non-destructive unresolved/contextless-link feedback and preserve link context across active-note changes; verify no file is created by missing links or `[[#Heading]]` without a source note.
- [ ] 5.4 Document link behavior, stable source context, and deferred hover previews; verify the documented examples open correctly or produce the documented unresolved state.

## 6. Tool activity and human decisions

- [ ] 6.1 Add compact expandable tool entries for progress, success, and failure; verify fixture tests and manual inspection of tool details without evaluating generated content.
- [ ] 6.2 Implement pending permission cards with explicit once/always/reject decisions and visible persistent-save scope; verify payload tests, failed replies, another-client races, and absence of automatic grants or configuration writes.
- [ ] 6.3 Implement form fields, conditions, validation, submit/cancel actions, safe external links, and unsupported-field errors for the pinned schema; verify fixtures cover every supported field type, hidden required fields, invalid answers, and user cancellation.
- [ ] 6.4 Reconcile settled and restored interactions after reconnect or another client's reply; verify tests prevent double submission and false success after uncertain network outcomes.
- [ ] 6.5 Document permission persistence, forms, and tool-detail behavior; verify a real permitted tool call and agent question are fully usable without opening the CLI.

## 7. End-to-end acceptance

- [ ] 7.1 Run the production build, lint, and complete automated suite; verify all pass and only intended source/documentation changes are present, with bundles and node_modules excluded from version control.
- [ ] 7.2 In the agreed disposable Windows test vault, verify automatic startup, a real streamed conversation, wikilink opening beside chat, tool activity, permissions, forms, agent/model changes, and stop; record observed results and versions.
- [ ] 7.3 Verify disconnect/reconnect, close/reopen during execution, theme switching, pane movement, and plugin disable while another client is connected; record any unavailable platform coverage or remaining release blockers without marking unperformed checks complete.
