# Tasks

## 1. Runtime compatibility gate

- [x] 1.1 Pin the v2 client dependency and add a lightweight automated test command; verify npm installation, client/service imports, and the existing production bundle succeed without unbundled runtime package dependencies.
- [x] 1.2 Validate service discovery, authenticated requests, and streamed events in the target Obsidian Electron runtime using an agreed disposable test vault; record tested OpenCode/Obsidian versions and transport choice in developer documentation, and stop for design revision if the local client approach fails.
- [x] 1.3 Replace exact-version matching with the broadest validated OpenCode 2.x eligibility range, targeting `>=2.2.2 <3.0.0` if supported by contract evidence; compare 2.2.2 and 2.3.2 registration/authentication, required API payloads, events, prompt identity, permissions, and forms, and keep or update the client pin accordingly. Test range boundaries, malformed versions, the documented prerelease/build-metadata policy, eligible-but-incompatible API responses, and non-destructive errors with sends/decisions gated; verify an incompatible shared service is never restarted or replaced.
  - Stable `>=2.2.2 <3.0.0`, build metadata accepted, prereleases rejected, and client pin 2.2.2 retained. Production Electron gate, real text answer, read tool, and form round trip pass against service 2.3.2. The event-definition review corrected a global version-1 validator bug: tool success/failure use version 2 in both releases and generated declarations. Exact event-specific versions, scope-before-payload validation, gating/non-replacement tests, and the baseline/lower-bound review are recorded in developer documentation; no version narrowing or behavior exception was adopted.
  - Use the OpenChamber source review pinned in `design.md` as a comparison reference: its client/server pins are 2.3.2 and its major-2 compatibility policy has a 2.2.4 minimum. Explicitly resolve the 2.2.2 versus 2.2.4 lower-bound evidence before changing our provisional target; source declarations alone are not live verification.
  - Compare `permission.request.list` / `form.list` with the pinned client's session-scoped pending lists; verify directory scoping, `permission.reply`, form reply/cancel payloads, capability handling, event validation/order, and snapshot-based recovery against actual contracts. Different OpenChamber call sites do not prove removal of older endpoints. Do not import service replacement, automatic trust handling, proxy-specific replay assumptions, or embedded-server architecture.

## 2. Plugin shell and local connection

- [x] 2.1 Replace sample identity and demo actions with desktop-only OpenCode metadata, a registered native view, ribbon action, and stable open-chat command; verify build/lint and that enabling the plugin alone does not start a service.
- [x] 2.2 Implement lazy deduplicated discovery/reuse using transient authentication and retained inactive executable-path settings; verify tests cover healthy service reuse, concurrent setup, no service or process launch on genuine absence, explicit retry, paths with spaces as data, invalid settings, incompatible services, and secret redaction.
  - Unblocked: the accepted workflow requires OpenCode to be running outside Obsidian. Automatic startup, executable lookup/validation, missing-executable/startup-failure handling, and ownership-race startup tests are follow-up technical debt in [GitHub issue #1](https://github.com/helmecke/obsidian-opencode/issues/1), not another task or release gate in this change. Verify the revised scope before checking 2.2 complete; do not claim startup works.
- [x] 2.3 Implement connection and view cleanup without stopping the shared service or interrupting execution; verify lifecycle tests cover concurrent opens, close/reopen, and plugin unload.
- [x] 2.4 Document installation, executable-path configuration, supported versions, provider data flow, permissions, and shared-service ownership in README; distinguish version eligibility from individually tested releases and API incompatibility, record 2.3.2 verification or remaining limitations in developer documentation, and verify instructions match implemented settings and do not describe the vault as a sandbox.
  - Reopened for the compatibility revision; existing exact-2.2.2 instructions must not be replaced by unverified claims of universal 2.x support.
  - Separate the pinned OpenChamber source findings, this plugin's contract-test evidence, and observed live runtime results. State the eligible range, tested versions, and unresolved limitations without implying the reviewed upstream snapshot identifies the user's installed OpenChamber build.

## 3. Session state and recovery

- [x] 3.1 Add current-vault session creation, scoped listing, selection persistence, and authoritative message loading; verify tests cover multiple projects, unavailable saved sessions, reopen, and no duplicate session creation.
- [x] 3.2 Implement fast event ingestion and session-scoped state reduction with bounded queues; verify fixture tests for text deltas, execution states, unrelated events, duplicate events, and queue overflow.
- [x] 3.3 Implement initial synchronization and reconnect with buffered events, snapshot reconciliation, bounded backoff, and explicit retry; verify deterministic tests cover events during snapshot loading, missed completion, pending interactions, and unload during retry.
- [x] 3.4 Implement stable prompt identity and uncertain-send reconciliation; verify lost-acknowledgment tests retain recoverable input and never duplicate admitted messages on retry.
- [x] 3.5 Document conversation persistence and connection recovery behavior; verify the documented states correspond to tested state transitions.

## 4. Native conversation controls

- [x] 4.1 Build the theme-aware conversation layout, multiline composer, incremental messages, and visible connection/execution errors; verify component tests and manual keyboard use in both main-tab and sidebar layouts.
  - Component tests pass. Trusted keyboard input confirmed multiline Shift+Enter and Mod+Enter sending in the main tab and the right sidebar; the view-local scope was added after Obsidian was found to consume the shortcut before DOM bubbling. Both layouts and light/dark theme switching were observed, and sidebar horizontal overflow was corrected.
- [x] 4.2 Add conversation selection and creation controls connected to vault-scoped state; verify selecting and reopening conversations shows authoritative messages without leaking another vault's state.
- [x] 4.3 Add server-backed agent/model selectors and explicit stop using session interruption; verify tests cover confirmed changes, failed changes, active interruption, and closing the view without interruption.
- [x] 4.4 Document the controls and close-versus-stop behavior in README; verify an in-Obsidian walkthrough follows the documented workflow.
  - The documented workflow was followed in Obsidian 1.15.1: creation/selection, send, streaming, agent/model changes, stop, close/reopen, keyboard shortcuts, and connection errors. Closing during execution preserved execution and restored the running conversation and pending form on reopen.

## 5. Markdown and wikilink navigation

- [x] 5.1 Add batched Obsidian Markdown rendering with managed component lifetimes; verify render tests and manual checks for split streamed markup, code blocks, inline code, final rendering, and repeated view disposal.
  - Automated batching/final-render/disposal tests pass. A live sidebar answer was observed growing through 35 intermediate renders; inline and fenced wikilink-looking syntax stayed literal code, and the final render completed. Repeated view reloads/disposal did not retain stale content. The streaming notification and render-throttle gaps found live were fixed and covered by tests.
- [x] 5.2 Route internal links through Obsidian resolution and non-chat-leaf navigation with stable vault-root context; verify routing tests plus manual alias, path, heading, block, and duplicate-basename checks in the disposable vault.
  - Routing tests pass. Observed CLI-driven activation of real Markdown links in Obsidian 1.15.1 opened aliases/paths, heading/block targets, and explicit duplicate-basename paths beside the retained chat leaf. Vault-root context remained stable across active-note changes; missing/contextless links showed notices and created no files. See `docs/runtime-compatibility.md`.
- [x] 5.3 Implement non-destructive unresolved/contextless-link feedback and preserve link context across active-note changes; verify no file is created by missing links or `[[#Heading]]` without a source note.
- [x] 5.4 Document link behavior, stable source context, and deferred hover previews; verify the documented examples open correctly or produce the documented unresolved state.

## 6. Tool activity and human decisions

- [x] 6.1 Add compact expandable tool entries for progress, success, and failure; verify fixture tests and manual inspection of tool details without evaluating generated content.
- [x] 6.2 Implement pending permission cards with explicit once/always/reject decisions and visible persistent-save scope; verify payload tests, failed replies, another-client races, and absence of automatic grants or configuration writes.
- [x] 6.3 Implement form fields, conditions, validation, submit/cancel actions, safe external links, and unsupported-field errors for the pinned schema; verify fixtures cover every supported field type, hidden required fields, invalid answers, and user cancellation.
- [x] 6.4 Reconcile settled and restored interactions after reconnect or another client's reply; verify tests prevent double submission and false success after uncertain network outcomes.
- [x] 6.5 Document permission persistence, forms, and tool-detail behavior; verify a real permitted tool call and agent question are fully usable without opening the CLI.
  - README documents the behavior and payload/DOM tests pass. A real read of the disposable fixture completed, an agent question appeared, and choosing Alpha through the rendered form controls completed the question tool and execution without errors. Expanded real tool entries retained safe inspectable details. This used the native chat; CLI tooling only drove Obsidian inspection, not the agent workflow.

## 7. End-to-end acceptance

- [x] 7.1 Run the production build, lint, and complete automated suite; verify all pass and only intended source/documentation changes are present, with bundles and node_modules excluded from version control.
  - Final 2026-11-22 run: 137/137 automated tests pass, production build succeeds, lint has 0 errors and one pre-existing settings-tab warning. `main.js`, probe bundles, and `node_modules` are ignored and untracked; only intended source, test, and documentation changes are present.
- [x] 7.2 In the agreed disposable Windows test vault with an already-running compatible service, verify discovery/reuse, absent-service feedback and discovery retry without process launch, a real streamed conversation, wikilink opening beside chat, tool activity, permissions, forms, agent/model changes, and stop; record observed results and versions.
  - Observed in Obsidian 1.15.1 / Electron 43.8.4 / Node 24.22.1 against externally managed OpenCode 2.3.2: authenticated reuse; fixed absence message and bounded retry with no process launch, then recovery; 35-revision streamed answer; alias/path/heading/block/duplicate-basename links beside chat; read and question tools; a real permission card from a session-scoped ask rule with Allow once and no saved grant; form answer; server-confirmed agent/model changes; and explicit stop. Details and remaining limitations are in `docs/runtime-compatibility.md`.
- [x] 7.3 Verify disconnect/reconnect, close/reopen during execution, theme switching, pane movement, and plugin disable while another client is connected; record any unavailable platform coverage or remaining release blockers without marking unperformed checks complete.
  - Close/reopen during execution (including pending-form restoration), theme switching, main-tab/sidebar movement, plugin disable/re-enable with the shared service unchanged, and a forced rediscovery failure followed by automatic bounded-backoff reconnect to the same session were observed. A mid-stream OS-level socket drop was not forced; stream-end recovery is covered by deterministic tests. Details are in `docs/runtime-compatibility.md`.
