# Runtime compatibility gate

## Current support policy

| Component | Requirement or evidence |
| --- | --- |
| OpenCode runtime eligibility | Stable releases `>=2.2.2 <3.0.0`, subject to required API/event compatibility checks |
| Bundled `@opencode/client` | Pinned to `2.2.2`; not a bundled OpenCode executable |
| Obsidian | Minimum `1.14.5` in the manifest; historical transport probe on `1.14.5`, production connection probe on `1.15.1` |
| Tested desktop runtime | Windows; latest production connection probe: Electron `43.8.4`, embedded Node `24.22.1` |

Version eligibility is not a claim that every 2.x release has been tested.
Valid SemVer build metadata (for example `2.3.2+build.1`) does not change
eligibility. Prereleases, versions below `2.2.2` or at/above `3.0.0`, prefixes,
leading-zero release numbers, whitespace, and missing/malformed versions are
rejected. An eligible version must also satisfy the required API and event
contracts. Unsupported endpoints or incompatible responses produce an
**Incompatible OpenCode API** error and keep sends and decisions disabled.

Individually observed evidence is narrower: **2.2.2** passed the historical
Electron transport experiment; **2.3.2** passed the validated production
discovery/authentication/connection-event probe in both host Node and Obsidian
Electron, followed by the full in-Obsidian acceptance workflow on 2026-11-22
(streamed answer, links, tools, permission card, form, agent/model changes,
stop, close/reopen, and plugin disable). That workflow did not force an
OS-level mid-stream socket drop; stream-end recovery is covered by deterministic
tests. The [client contract review](client-contract-review.md) is source
evidence, not a live acceptance result or identification of your installed
OpenChamber.

An incompatible shared service is left untouched: the plugin does not restart,
replace, or reconfigure it. Do not downgrade a shared service just to match the
plugin; coordinate lifecycle changes with other connected clients.

The earlier disposable-vault transport experiment verified authenticated API
access and a live `server.connected` event using in-process Node HTTP with a Web
stream bridge; renderer `fetch` failed in that runtime. The 2026-11-22
acceptance run used the installed production plugin; details and remaining
limitations are below. Older Obsidian versions, macOS, Linux, and mobile have no
claimed test coverage; mobile is unsupported.

## Compatibility revision investigation (2026-11-22, incomplete)

### Latest live findings

- A real synthetic text prompt completed successfully through the installed
  plugin after correcting the `msg_` identity prefix and omitting `order` on
  message-cursor follow-ups. Its final Markdown retained inline/fenced wikilinks
  as literal code.
- CLI-driven clicks on actual rendered links opened the aliased
  `Acceptance/Example`, its `#Details` heading, its `#^acceptance-block` block,
  and `Acceptance/Other/Example` (duplicate basename) in non-chat leaves.
  Navigation preserved an empty vault-root source path after active-note
  changes. Chat retained its leaf and transcript. Missing/contextless references
  made no navigation call, showed the documented notices, and left the vault's
  file list unchanged.
- A live tool/form check found and corrected the validator's erroneous global
  version-1 assumption. `session.tool.success` and `session.tool.failed` use
  durable version **2 in both reviewed releases**, as do deletion/fork/instruction
  update events; the generated declarations agree. Known event types now require
  their exact reviewed version, ephemeral types reject unexpected durable
  envelopes, and unknown types are forwarded only for recovery. No blanket
  acceptance of arbitrary versions was added.
- With that correction installed, a fresh real read of
  `Acceptance/Example.md` completed in the chat, the agent's question appeared
  with Alpha/Beta controls, and selecting Alpha and **Submit** completed both
  the question tool and execution without errors or CLI interaction with the
  agent. Six tool entries (including earlier diagnostic calls) were expanded in
  the actual view and retained completed states. No persistent grant, service
  restart, or configuration write was used to work around the validator error.
- Event payload validation now occurs after session/vault scope selection, so
  another client's unsupported form fields cannot disable this conversation.
  Unknown field types in the selected session's own form are preserved and
  reported by the form card, which blocks submission instead of sending a
  partial answer. Generic envelopes are still checked at the transport boundary.

The implementation admits the policy summarized above. Eligibility is separate
from required API/event compatibility. Automated boundary/non-replacement tests
and the production Electron gate cover this policy. This range does not claim
individual testing of every eligible release.

- Compared the installed pinned 2.2.2 package with the published
  `@opencode/client@2.3.2` npm archive (SHA-1
  `39f211db5f0f5ea7d098f554fd29f91affd70762`). `dist/service.d.ts` is
  unchanged. The generated Promise client declarations retain the session,
  message, prompt, agent/model, permission, and form methods used by this plugin.
- The generated type declaration diff retains the prompt identity, permission
  decision, form field/reply/cancel, and session-scoped pending-list types.
  Both releases also expose directory-scoped pending-list interfaces; the
  OpenChamber call sites alone do not establish removal of session-scoped lists.
  These declaration comparisons are not verification of endpoint implementations,
  directory header encoding, runtime validation, or event ordering.
- 2.3.2 adds the durable `session.step.first-token` event and optional
  assistant-message `time.firstToken`. The existing reducer's default recovery
  behavior needs explicit review and regression coverage for that new event.
- The reviewed OpenChamber compatibility source at commit
  `30c70496a5ca0105e04e60a783964576973edc8f` sets its own minimum to 2.2.4.
  Its source does not explain that minimum; it is not evidence that this plugin's
  baseline 2.2.2 contracts are insufficient. The lower-bound review remains open.
- A read-only host-Node probe using the production `createNodeFetch` adapter,
  transient `Service.headers` authentication, and `client.server.info` found
  registered and reported service version **2.2.5**, with matching PID. No
  credentials, endpoint, transcript, or vault content were printed. No service
  startup, restart, replacement, registration/configuration write, prompt, or
  permission decision was performed.

After the user explicitly authorized a service restart and reported completing
it, authenticated health reported **2.3.2**, matching the registration and PID.
The plugin did not perform that lifecycle change; its discovery-only ownership
policy is unchanged.

`scripts/production-connection-probe.mjs` bundles the actual discovery and
transport adapters. In host Node **26.13.0**, it verified 2.3.2 discovery,
authenticated identity, unauthenticated HTTP 401, `server.connected`, and
read-only vault-scoped session, agent/model, permission-request, and form
listings. No session was created and no prompt or decision was sent. Empty
pending lists are not evidence of a real permission or form round trip.

The running-service result is not inferred from CLI output. A subsequent
production-adapter probe in **Obsidian 1.15.1 / Electron 43.8.4 / embedded Node
24.22.1** also passed against **2.3.2**: matching authenticated identity,
unauthenticated HTTP 401, `server.connected`, and the same read-only scoped
listings. This probe observed seven agents and 78 models, with no conversations
or pending interactions in the disposable vault. It is a transport/read-only
gate, not evidence of a real prompt, tool call, permission, or form round trip.
The probe was rebuilt and rerun with the validated production client: it passed
the same Electron gate. Live session creation and server-confirmed agent/model
changes also succeeded through the installed plugin. The
[contract review](client-contract-review.md) compares the required endpoints,
registration/authentication, prompt identity, permission/form schemas, directory
encoding, and additive events. It establishes that OpenChamber's 2.2.4 minimum
comes from a configuration feature this plugin does not use; the 2.2.2 lower
bound and client pin are retained.

Required API responses and used event fields are validated at the client
boundary. Initial synchronization verifies agent/model lists before readiness;
incompatible required endpoints, payloads, or events disable sends and decisions
with a fixed API error and require explicit retry. Authentication, transient
network failures, missing sessions, and server-side form answer rejection remain
distinct. Regression tests cover malformed responses, endpoint mismatch,
interaction/session scoping, first-token ordering, and non-replacement.

Contract review also found that prompt identities require `msg_`. Both default
and fallback generators now preserve that prefix; tests cover the default
generator as well as stable identity/reconciliation. Full live conversation,
permission, form, and lifecycle acceptance was recorded on 2026-11-22; see
[Live Electron acceptance](#live-electron-acceptance-2026-11-22) below.

A CLI wrapper request did not return and was cancelled; that cancellation is
not recorded as an Obsidian failure. Direct `node:child_process.execFile`
invocation of the Obsidian executable with `windowsHide: true` and a bounded
timeout successfully returned vault-targeted `eval` results. No global CLI or
Obsidian configuration was changed by these checks.

Manual checks used a disposable vault outside this repository.

The older exact-version statements below are historical verification records,
superseded by the current eligibility policy above.

## Automated verification

Task 1.1 verified on Windows with Node.js 26.13.0 and pinned
`@opencode/client` 2.2.2:

- `npm install --save-exact @opencode/client@2.2.2` succeeded.
- `npm test` imports both the Promise client and local service entrypoint
  without discovering or starting a service.
- The suite bundles both entrypoints as ES2021 CommonJS, checks the esbuild
  dependency graph for unbundled packages, and executes the bundle in Node.
  Only native Node modules remain external. Client construction performs no
  requests; authentication and streaming are covered by the separate runtime
  probes below, not by these automated import/bundle tests.
- `npm run build` succeeds with the existing plugin entrypoint.
- The original sample code still fails `npm run lint` (sample names, demo
  interval, console logging). These are existing issues addressed by task 2.1;
  the new tests and ESLint configuration pass their focused lint check.
- `npm audit --omit=dev --audit-level=moderate` reports no vulnerabilities.
  The complete audit reports six development-tooling vulnerabilities (three
  moderate and three high); no automatic audit fixes or tooling downgrades
  were applied.

Run `npm test`, `npm run build`, and `npm run lint` from the repository root.
The smoke bundle is evaluated in memory and is not a release artifact.

## Supported OpenCode version policy

The initial accepted range is **`=2.2.2`**: only the exact string `2.2.2` is
accepted. This matches the pinned client, published registration contract, and
successful Electron transport experiment. No support is inferred for the rest
of `2.x`, prereleases, build-suffixed versions, or missing/malformed versions.
Expand this policy only after testing the registration, API, and event contracts.
Full conversation, permission, form, and startup acceptance remain pending.

`src/opencode/compatibility.ts` defines the current eligibility policy and a
fixed, actionable error that does not interpolate untrusted service metadata.
The production connection path in `src/opencode/discovery.ts` is reuse-only: it
validates the discovered service and never invokes a startup adapter.

A provisional `src/opencode/service-policy.ts` once gated service reuse and a
future startup callback. Post-archive verification removed it because production
code never imported it and its `startWhenAbsent` path conflicted with the
accepted existing-service workflow. `tests/compatibility.test.mjs` now covers
version eligibility, recovery guidance, and redaction; `tests/connection.test.mjs`
covers discovery/reuse, identity changes, and non-replacement. Automatic startup
remains outside this change in issue #1.

Task 1.3 historical verification: all nine automated tests, production build,
and focused lint on the then-new modules/test passed. The gate was never wired
into the production plugin.

## Plugin shell verification (task 2.1)

The plugin now uses the `opencode-chat` ID and OpenCode name and is desktop-only.
The minimum Obsidian version and version mapping are 1.14.5, the runtime recorded
below; compatibility with older Obsidian versions is not claimed.

`tests/plugin-shell.test.mjs` bundles the actual plugin entrypoint with a strict
Obsidian mock. Enabling registers only the `opencode-chat` ItemView, chat ribbon,
and stable `open-chat` command. The bundle contains only the three shell modules
and imports no service, networking, or process APIs. Enabling neither opens a
view nor starts or contacts OpenCode. The tests also cover opening a native tab,
revealing an existing leaf after sidebar placement, placeholder rendering/cleanup,
safe open-failure feedback, and metadata consistency.

Production build, all 14 automated tests, and lint pass. Lint retains one existing
`no-global-this` warning in `scripts/runtime-probe.mjs`. These are automated shell
checks, not a new live Obsidian acceptance run. The view deliberately shows a
preview placeholder; connection setup, settings, and conversation controls remain
for subsequent tasks.

## Electron verification

Node success alone does **not** establish Electron compatibility. The runtime
probes below target a disposable vault directly. The initial version policy is
defined above; production discovery and non-destructive startup remain pending.

The installed OpenCode executable reports `opencode v2.2.2`.

### Electron probe results

The disposable vault is open and the CLI is working. Observed versions:

| Component | Version |
| --- | --- |
| Obsidian / installer | 1.14.5 / 1.14.5 |
| Electron | 43.8.3 |
| Embedded Node | 24.22.0 |
| Chromium | 150.0.7871.250 |
| Installed OpenCode / pinned client | 2.2.2 / 2.2.2 |

Bundled `scripts/runtime-probe.mjs` as ES2021 CommonJS with Node built-ins
external, placed the output at `.obsidian/runtime-probe.cjs` in a disposable
vault, and invoked its `run()` through the vault-targeted Obsidian CLI.
This is a standalone developer probe, not an installed/enabled plugin.

- Both client entrypoints import and execute in Electron.
- `Service.discover({ version: '2.2.2' })` returns no endpoint in the renderer.
- The same call in host Node discovers an authenticated service successfully.
- The host Node probe also completes `client.server.info` with version 2.2.2
  and receives `server.connected` through the generated event subscription.
  This is a control check, not proof of Electron transport compatibility.
- A direct authenticated `/api/info` request using renderer `fetch` and the
  existing registration fails with `TypeError`. The renderer origin is
  `app://obsidian.md`. A subsequent diagnostic captured the message
  `Failed to fetch`; this alone does not establish CORS as the cause.
  No credentials or registration contents were printed.
- Therefore renderer fetch is **not a validated transport** in this runtime.
  The Node transport probe below is the successful alternative.
- No service ensure/start/stop operation, conversation creation, model request,
  service-registration write, global fetch override, or CORS change was made.

### Successful in-process Node transport

Bundled `scripts/node-transport-probe.mjs` to
`.obsidian/node-transport-probe.cjs` in a disposable vault and invoked `run()`
through the vault-targeted CLI. Observed:

- Reads the standard local registration using the client's `fallback()` path.
- Uses transient authentication headers from `Service.headers`.
- Uses `node:http.request` with a Web `ReadableStream` bridge passed through
  the documented `OpenCode.make({ fetch })` option. Only loopback HTTP is
  accepted and redirects are not followed.
- Authenticated `client.server.info` succeeds; server PID matches the local
  registration and the reported version is exactly 2.2.2.
- The unauthenticated info request returns HTTP 401.
- The generated event subscription receives `server.connected`; iteration
  then ends and releases its subscription. This verifies live connection, not
  text deltas, provider execution, or reconnection.
- No startup, shutdown, global fetch mutation, or CORS changes are required.

Task 1.2's runtime experiment is complete. The selected transport for further
implementation is in-process Node HTTP with a Web stream bridge, not an
isolated process. This probe is not production connection code. Automatic
startup and production discovery still require implementation and tests.

The pinned service helper uses the renderer's global `fetch` internally and
does not accept the custom `fetch` option exposed by `OpenCode.make`. A Node
HTTP transport for client requests alone does not fix that helper. The approved
design now chooses a pinned, read-only local discovery adapter with registration
and health validation. Do not patch the dependency, globally replace fetch,
or switch to SDK hosting.

When rerunning the probe through `require`, evict its exact entry from
`require.cache` after rebuilding so Electron does not reuse the previous bundle.

### Research supporting the transport experiment

- [Obsidian networking discussion](https://forum.obsidian.md/t/make-http-requests-from-plugins/15461):
  desktop Node networking as an alternative to renderer fetch.
- [Streaming request API discussion](https://forum.obsidian.md/t/support-streaming-the-request-and-requesturl-response-body/87381):
  `requestUrl` bypasses CORS but does not provide the required live body stream
  in the cited reports.
- [ChatGPT-MD Node HTTP implementation](https://raw.githubusercontent.com/bramses/chatgpt-md/develop/src/Services/requestStream.ts):
  concrete Node response-to-Web-stream bridge.
- [Perplexed streaming fix](https://github.com/lossless-group/perplexed-plugin/commit/01897c0903e8df25c9f00d4249df160c62c67205):
  a similar renderer-origin failure fixed with Node HTTPS.
- [OpenCode V2 client documentation](https://opencode.ai/v2/docs/build/client):
  supported custom fetch injection for API calls and event subscriptions.

These reports support trying Node transport; they do not prove the precise
cause of this renderer's fetch failure or validate a production discovery adapter.

Do not alter shared-service registration,
restart an incompatible service, weaken authentication, or change global CORS
configuration. If the documented client approach fails, pause for design
revision before building the full UI.

### Task 2.2 independent implementation (2026-10-29, historical scope)

Production modules now provide lazy, deduplicated discovery and reuse with
transient authentication, bounded read-only registration and health validation,
literal-loopback origin binding, redirect rejection, and Node HTTP streaming.
The settings tab stores only the executable path; paths with spaces remain
plain data and are never passed to a shell. Chat offers **Retry discovery**.
Genuine registration absence reports the upstream startup safety blocker and
launches no process. Invalid, unreachable, incompatible, or changed registrations
remain distinct errors, never startup permission.

Automated tests use in-process disposable loopback HTTP fixtures and temporary
registration files, not the user's service or vault. They cover reuse,
authentication/redaction, deduplication/retry, unsafe URLs/redirects, bounded
responses, identity/credential changes, cancellation, and settings validation.
Executable lookup, actual startup, missing-executable/startup-failure behavior,
and Windows launcher handling remain unimplemented behind the ownership gate.
The earlier probe does not validate these production adapters in Electron;
that rerun and automatic-startup acceptance remain pending. Task 2.2 stays
unchecked; no task 2.3 lifecycle completion is claimed.

### Scope decision and startup technical debt (2026-10-30)

The user accepted the existing-service workflow to prioritize a usable plugin.
Automatic startup is now outside `add-native-opencode-chat`, tracked in
[GitHub issue #1](https://github.com/helmecke/obsidian-opencode/issues/1), not
another task in the change or a release prerequisite. Earlier startup-gate
statements above describe the historical plan and are superseded by this
decision. Task 2.2 is unblocked for verification of its revised discovery/reuse,
transient authentication, deduplication, inactive path settings, absence/retry,
and redaction scope; its checkbox must reflect verification, not this deferral.
Actual startup and executable lookup/validation remain unimplemented.

Source comparison between released OpenCode 2.2.2 and 2.2.4 found no changes to
CLI server startup, registration publication/watcher, the service-start handler,
or the Promise service helper. Issue #1 records that evidence and the deferred
startup/path/failure/ownership-race tests. No live startup race was run and no
shared service was changed. This review does not establish API/Electron support
for 2.2.4: the accepted runtime and pinned client remain exactly 2.2.2 until
separately verified. Production Electron acceptance and the remaining chat/UI
tasks are still required; removing startup from scope is not a release claim.

## Native chat implementation (2026-11-22)

The remaining plugin implementation is in place. The README is the user-facing
record for the behaviors below; this section records what automated checks
establish, and the live Electron acceptance run is recorded at the end of it.

### Conversation persistence and recovery (task 3.5)

- Only the executable path and the selected session ID plus exact vault directory
  are persisted. Transcripts, credentials, and drafts are never written to
  plugin data.
- Reopen reloads authoritative messages from OpenCode. A saved session that is
  missing or moved to another workspace produces a recoverable empty state.
- Connection states are `inactive`, `synchronizing`, `ready`, `retrying`,
  `exhausted`, and `disposed`. These match the tested transitions in
  `tests/synchronization.test.mjs`: initial snapshot, buffered-event overlap,
  disconnect, bounded backoff, exhaustion, explicit retry, and unload.
- A prompt with a lost acknowledgment is shown as `Not confirmed`; draft text is
  retained. Reconciliation checks authoritative messages before retry, and retry
  reuses the same prompt identity. Tests cover an admitted message that must not
  be sent again and a genuine loss that retries the same ID.
- Sends and decisions are gated while synchronizing. Recovery never replays a
  prompt, decision, or execution.

### Controls and close-versus-stop (task 4.4)

The README walkthrough matches the observed workflow: conversation
creation/selection, multiline composition with Ctrl/Cmd+Enter, agent/model
selectors, explicit stop, and connection errors. Automated component tests cover
the same controls. Trusted Shift+Enter and Mod+Enter were observed in both the
main tab and sidebar. Closing or moving the view does not call interruption;
only **Stop** does.

### Markdown and link navigation (task 5.4)

Answers use Obsidian `MarkdownRenderer`. Internal link decisions are tested with
paths, aliases, headings, block references, duplicate basenames, unresolved
targets, and contextless `[[#Heading]]` references. A resolved link is opened in
a separate leaf with the stable vault-root source path; unresolved targets only
produce a notice and never create files. Hover previews are intentionally
deferred. Live activation of aliases, explicit paths, headings, blocks, and a
duplicate basename opened the intended notes beside the retained chat leaf;
missing and contextless references produced notices without creating files.

### Permissions, forms, and tool details (task 6.5)

Permission cards submit explicit `once`, `always`, or `reject` decisions and show
the server-provided persistent scope; `always` is unavailable when no scope is
provided. No automatic grant or configuration write exists. Form fixtures cover
text, choice, multiselect, number, integer, boolean, external links, conditional
visibility, hidden required fields, invalid answers, cancellation, and
unsupported field types. Tool entries distinguish preparing/running/completed/
failed states and render details as text. A live read tool completed, a live
agent question was answered through the rendered controls, and a session-scoped
`ask` policy produced a real permission card whose **Allow once** decision
completed the command without saving a persistent grant.

### Automated verification (task 7.1)

`npm test`, `npm run build`, and `npm run lint` are the release checks. The
automated suite includes the prompt, API-contract, event-version,
synchronization-action, interaction, Markdown-routing, streaming, keyboard-scope,
and component-control tests. The archived change's final run on 2026-11-22
passed **137 tests**; the post-archive cleanup run passed **133 tests** after
removing the unused startup-policy tests. The production build succeeded, and
lint completed with no errors and one pre-existing warning about the settings
tab's declarative API. Generated `main.js`, probe bundles, and `node_modules`
remain untracked.

### Live Electron acceptance (2026-11-22)

Observed in a disposable test vault with Obsidian 1.15.1, Electron 43.8.4,
embedded Node 24.22.1, and an externally managed OpenCode service reporting
2.3.2:

- Discovery and authenticated reuse succeeded. Automatic startup remained
  absent. Setting `XDG_STATE_HOME` to an empty test directory produced the fixed
  absence message, no process launch, disabled sends, automatic bounded retry,
  and recovery once the real registration path was restored. The shared
  registration, PID, and version were unchanged.
- A real streamed answer grew through **35 observed revisions** before the final
  render. Inline and fenced wikilinks stayed literal, Markdown links resolved,
  and the transcript followed the bottom while streaming.
- Trusted keyboard input from the Obsidian window confirmed **Shift+Enter**
  multiline composition and **Mod+Enter** sending in both the main tab and the
  right sidebar. Obsidian consumes shortcuts through the view scope; the earlier
  DOM-only handler did not receive trusted Mod+Enter. The new scope sends only
  when its composer owns focus and unregisters on close/reopen.
- Main-tab and sidebar layouts, moved leaves, light/dark theme switching, and
  text/background tokens were observed. Sidebar content no longer overflows
  horizontally after constraining select widths.
- Closing the view during active execution and reopening restored the same
  conversation, running state, and pending form. **Stop** then produced an
  observed `interrupted` state. Closing itself did not interrupt.
- A disposable session created with a session-scoped `shell → ask` rule produced
  a real permission card for `echo OPENCODE_PERMISSION_ACCEPTANCE`, showed the
  persistent scope `echo *`, and **Allow once** completed the command with
  `OPENCODE_PERMISSION_ACCEPTANCE` output. No saved grant appeared and the test
  session was removed. This used session-scoped test policy, not a config edit.
- Disabling the plugin while another client used the service left the service
  running at the same PID/version; re-enabling reopened the chat view. No service
  stop or interruption was initiated by the plugin.

A forced rediscovery transport failure while the view was ready produced the
fixed recovery error, `retrying`, attempt 1, and a 500 ms bounded retry; restoring
the registration path reconnected automatically to the same session and
execution state, with the service PID/version unchanged. This exercised the
production disconnect/reconnect state machine, but a mid-stream socket drop was
not forced at the OS/network layer; stream-end handling is covered by
deterministic tests. Task 7.2's listed observations are recorded above.

The earlier exact-2.2.2 statements above are historical records superseded by
the current eligibility policy and these observations.

## Managed OpenCode startup (2026-11-22)

The plugin now has a private managed-runtime fallback. It still reuses a healthy
shared service first and never writes, stops, or replaces that service. When
discovery reports `absent` or a registration whose process is gone (`stale`),
automatic startup (default on) resolves the OpenCode 2 executable, validates
`opencode --version` against `>=2.2.2 <3.0.0`, selects an ephemeral loopback
port, and spawns `serve --hostname 127.0.0.1 --port <n>` with a fresh random
password and a plugin-private `XDG_STATE_HOME`.

Automated coverage added in `tests/managed-runtime.test.mjs`:

- Executable resolution keeps paths with spaces as data, uses `PATH` and common
  locations, rejects a missing executable, and rejects the Windows `.cmd` shim.
- Version parsing accepts only `opencode vX.Y.Z`; 1.x, 3.x, malformed output, and
  query failures map to the fixed version error without leaking output.
- Port selection binds literal `127.0.0.1`, releases the port, and retries once
  on `EADDRINUSE`.
- Spawn options assert separate arguments, no shell, hidden windows, piped
  output, the transient password, the private state directory, and an unchanged
  shared registration.
- Readiness polls `/api/info`, requires the spawned PID, and times out within a
  bounded budget.
- Disposal kills the process tree and clears the orphan record; a recorded orphan
  is stopped before a new start; crashes restart with bounded backoff and end in
  a fixed, password-free failure.
- The coordinator falls back only on `absent` or `stale`; registration,
  authentication, identity, and transport failures never launch a process.
- The view reports **Starting OpenCode…** and distinguishes **Connected · Shared
  service** from **Connected · Managed service**.

`npm test` (145 tests), `npm run build`, and `npm run lint` pass after this
change. Lint has no errors and two warnings (declarative settings API and sentence
case for the **OpenCode 2 executable path** label).

The manual acceptance in task 5.2 was performed on 2026-11-22 in a disposable
test vault with the locally built plugin, Obsidian's process environment, and a
locally installed `opencode v2.3.2` executable. Observations:

- With `XDG_STATE_HOME` pointed at an empty directory (so discovery saw no
  registration), opening chat resolved the native binary, started a managed
  process, and showed **Connected · Managed service**. The recorded managed PID
  was alive and the real shared `service.json` stayed byte-identical.
- On reload, the real shared registration pointed at a dead PID. Discovery
  reported `stale`, started a managed process without modifying that
  registration, and the view showed the managed connection.
- A disposable healthy loopback registration satisfied authenticated
  `/api/info`; discovery reused it with connection mode `shared` and did not
  launch another process. This was a fixture at the discovery boundary, not a
  real second OpenCode shared service.
- An incompatible disposable registration (version `1.9.9`) produced the fixed
  compatibility error with sends disabled and retry enabled; no replacement
  process started. An unhealthy registration (HTTP 500) produced the fixed
  transport error; the existing managed PID was unchanged and no replacement
  started.
- Disabling the plugin stopped the managed process tree; the PID stopped
  responding, no `opencode.exe` remained, and the persisted orphan record was
  cleared. The real shared registration remained unchanged throughout.
- Re-enabling and reopening chat started a fresh managed process and returned to
  a ready conversation.

The vault and plugin were left enabled with the managed runtime connected. No
shared service was stopped, started, or replaced.

## Composer note linking (2026-11-22)

The chat composer now pairs square brackets and completes vault Markdown notes
after `[[`. The reference stays plain prompt text; no file attachment is added.
Live acceptance in a disposable test vault (Obsidian 1.15.1, Electron
43.8.4, Node 24.22.1) observed:

- `[[` opened an inline list for duplicate-basename notes, with the basename and
  vault-relative folder on each row.
- Selecting `Acceptance/Other/Example` inserted
  `[[Acceptance/Other/Example]]`; selecting a unique note inserts `[[Note]]`.
- Arrow keys moved the selection, Enter inserted it without sending, and Escape
  or blur closed the list.
- Ctrl+Enter sent while the list was open; the prompt contained the exact
  `[[...]]` text and no structured file attachment.
- Light and dark themes and a 300px sidebar rendered the list legibly, with the
  popover kept inside the viewport.
- `npm test` passed 161 tests, `npm run build` succeeded, `npm run lint`
  reported no errors, and reloading the plugin produced no captured errors.

## Native Obsidian UI styles (2026-11-22)

The plugin's presentation now reuses verified Obsidian surfaces instead of
reimplementing them. Chat behavior, protocol, persistence, and settings are
unchanged.

- New conversation, Retry discovery, Stop, and Send are real `<button>` elements
  with `clickable-icon`, `setIcon`, and `setTooltip`; `disabled` and
  `aria-disabled` are synchronized. Send keeps the plugin accent circle.
- Selectors use native global `select` styling, with only width and truncation
  constraints retained for the toolbar and narrow sidebar.
- Agent forms use native `setting-item` rows with native controls, grouped
  checkboxes, `setting-item-error` + `is-invalid` for errors, and `hidden` for
  conditional rows. Permission required uses warning-callout markup with every
  decision and the persistent-scope warning inside its content.
- Rendered answers carry `markdown-rendered`, and the duplicated margin rules
  are removed. Chat-specific structures (composer card, message bubbles, tool
  entries, reasoning disclosure, suggestions) stay plugin-owned with theme
  variables, and `styles.css` documents the native surfaces it relies on.
- Accepted visual deviations from the previous composer: square native icon
  buttons, host-styled selects, settings-style form rows, and a warning-callout
  permission surface replace the former custom chrome. The Send accent, all
  accessible names and tooltips, disabled states, and keyboard paths remain.

Automated verification: `npm test` passed **163 tests**, `npm run build`
succeeded, and `npm run lint` reported 0 errors and 2 pre-existing warnings
(declarative settings API; sentence case for **OpenCode 2 executable path**).
The manual light/dark, narrow-sidebar, keyboard, and form pass is recorded in
task 5.3 of the change.

## Composer skill mentions (2026-11-22)

The chat composer now completes OpenCode skills after `$`. Note links (`[[`)
still take precedence, and the existing Mod+Enter send path remains the only
send shortcut while the inline list is open.

- A `$` at the start of the message or after whitespace opens the inline skill
  list; a `$` inside a word, or a query that gains whitespace or a newline,
  does not. Rows show the skill name and its description when the service
  provides one.
- The list filters by fuzzy name match, lists all skills in name order for an
  empty query, and inserts `$skill-name ` with the caret after the space.
  Enter, Tab, and pointer selection insert without sending; Escape or blur
  closes the list; Ctrl/Cmd+Enter still sends while it is open.
- The skill catalog loads lazily on the first `$` query, is shared by
  concurrent callers, and is cached for the connection. It is not requested
  during the initial connection. A failed load publishes an empty catalog and
  does not block composing or sending.
- Sending resolves `$name` tokens by exact name against the loaded catalog and
  attaches each unique matching skill by ID as `skills: [{ id }]`. The prompt
  text is unchanged; duplicate mentions attach once; unknown names stay plain
  text. An unconfirmed retry reuses the same prompt identity and skill IDs.
  Messages without mentions do not request the catalog.

Automated verification: `npm test` passed **183 tests**, `npm run build`
succeeded, and `npm run lint` reported 0 errors and 2 pre-existing warnings
(declarative settings API; sentence case for **OpenCode 2 executable path**).
The manual smoke test in a disposable test vault confirmed that `$`
completion filters and inserts a skill, the sent prompt retains `$name` and
carries the skill attachment, and `[[` completion and Mod+Enter sending still
work.

## Composer slash commands (2026-11-23)

The chat composer now completes and runs OpenCode commands after a leading `/`.
Note links, skill mentions, and the existing send path are unchanged.

- `/` opens the inline command list only at the start of the message while the
  caret remains in the first token. A `/` after text, a `/` inside a word, and
  a caret in the arguments do not open it.
- Rows show the command as invoked (`/name`) and its description when the
  service provides one. Nested names such as `/team/review` are supported. The
  list filters by fuzzy name match, lists all commands in name order for an
  empty query, and inserts `/name ` with the caret after the space while
  preserving text that followed it. Enter, Tab, and pointer selection insert
  without sending; Escape or blur closes; Ctrl/Cmd+Enter still sends.
- The catalog loads on the first `/`, is shared by concurrent callers, and is
  cached for the connection. It is not requested during the initial
  connection. A failed load publishes an empty catalog and does not block
  composing or sending.
- A message whose first token exactly matches a loaded command runs it through
  `session.command({ sessionID, name, text, skills? })`; the rest of the message
  is the argument text and `$name` mentions attach the same unique skill IDs as
  ordinary prompts. Unknown names and an unavailable catalog keep the ordinary
  prompt path, so slash-leading prose is never dropped. A confirmed command
  refreshes the selected snapshot and clears the composer; a failed command
  keeps its text, reports `Unable to run the command…` in the composer card,
  and is never resent.

Supported API surface for this feature:

- `client.command.list({ location })` returns `{ location, data }` with a
  non-empty command `name` and optional `description`; unknown fields are
  preserved. The endpoint is optional and non-gating.
- `client.session.command(...)` is deliberately not passed through the
  prompt compatibility translator: a 404 may mean command-not-found, so
  command-not-found and command-execution errors are ordinary command failures
  rather than API incompatibility. Other failures still use the existing
  incompatibility gate.

Live acceptance in a disposable test vault (Obsidian 1.15.1, Electron
43.8.9, Node 24.22.1) observed:

- Typing `/` opened the popover with the full catalog; each row showed
  `/name` and its description, and typing `/te` filtered the rows.
- Typing `/team/r` matched the nested `team/review` row and Enter inserted
  `/team/review ` with the caret after the space.
- Sending `/team/review NESTED-ARG` and `/smoke ARG-ONE` executed the command
  templates (the agent returned `NESTED-COMMAND-OK` and `SLASH-COMMAND-OK`)
  and cleared the composer; neither appeared as prompt text.
- Sending `/unknown falls back` kept the exact text as an ordinary user prompt,
  confirming the fallback path.
- Sending a command whose configured agent did not exist kept `/fail KEEP-TEXT`
  in the composer, showed `Unable to run the command…` in the composer card,
  and made no automatic retry.
- `[[` still opened note completion, Escape closed it, and `$` still listed
  skills; Enter inserted `$smoke-skill ` and Ctrl/Cmd+Enter still sent.

Automated verification: `npm test` passed **207 tests**, `npm run build`
succeeded, and `npm run lint` reported 0 errors and the same 2 pre-existing
warnings (declarative settings API; sentence case for **OpenCode 2 executable
path**).

## Document-like transcript (2026-11-23)

The transcript now reads as one Markdown note: a quoted prompt aside, one
centered reading column, continuous native Markdown for answers, a faint
end-of-run footnote, and compact inline folds for reasoning, tools, shell,
compaction, and injected text. Routine success and selection records stay out
of the transcript; failures remain visible. Protocol, persistence, composer
controls, permissions, forms, and links are unchanged.

Live acceptance in a disposable test vault (Obsidian 1.15.1, Electron 43.8.9,
Node 24.22.1, managed OpenCode 2.3.2) observed:

- A long answer containing a heading, paragraphs, bulleted and numbered lists,
  a blockquote, a fenced code block, and a three-row table rendered as one
  document in the light and dark themes. The prompt read as a quoted aside,
  only turns added extra space, the footnote was faint, and no horizontal
  scrolling appeared in the full-width tab or the 300 px sidebar (264 px
  content with equal scroll and client widths).
- A real shell tool entry showed the muted wrench icon, name, duration
  (`0.2s`), and a single-line input preview truncated at 80 characters. Its
  input and result stayed plain text when expanded, and the fold opened by
  mouse click and by keyboard Enter through CDP without widening the column.
- A reasoning fold used the same row shape with a brain icon, the name
  **Reasoning**, and a one-line preview of its text. Hover through CDP swapped
  the icon for a right-pointing chevron, and an open fold kept the chevron
  turned down. Reasoning and tool folds showed no separator rule after the
  border was removed.
- A successful run ended with `opencode · Tidepool Alpha Free · build · 26.7s`
  in the transcript and `Connected · Managed service · Answered` in the
  composer. A deliberately unavailable command model produced
  `Execution failed. Model unavailable: missing-provider/missing-model` and
  `Connected · Managed service · Failed`; stopping a run produced
  `Execution interrupted.` and `Stopped`. Selection-change records were absent.
- Reloading the plugin and reopening the saved conversation restored the same
  prompts, answers, footnotes, folds, and failure line without replaying a
  prompt. No console or plugin errors were captured.
- The failed-run check used a project-local command fixture with a missing
  model to induce a real service error without touching the shared registration
  or spending on an external provider. The fixture was removed after
  acceptance; the disposable session retains its failed transcript. The
  transcript failure line and composer status were therefore verified against
  a real service error, not a mocked DOM.

### Readable line length (2026-11-23)

The transcript and the composer card follow Obsidian's **Readable line length**
setting instead of always capping themselves at the note measure. The view
mirrors the native `is-readable-line-width` class from
`Vault.getConfig("readableLineLength")`, updates on the vault's `config-changed`
event, and uses the same `--file-line-width` measure as Markdown views
(Obsidian's default is `700px`). The installed `app.css` was checked first:
Markdown views receive the class from that setting and cap `.cm-sizer` at
`--file-line-width`, so the plugin only reuses the class and the variable, not
the host declarations.

Live check in the disposable test vault with the same build:

- With the setting on, the view carried `is-readable-line-width`, the
  transcript content measured 688 px inside the pane's 1252 px content box
  (the 700 px measure less the scrollbar), and the composer card measured
  700 px. Their left edges lined up exactly; the card's right edge sat one
  scrollbar width past the text.
- Turning the setting off through the vault config removed the class without
  reopening the view. The transcript filled the pane (1208 px with the 16 px
  inset) and the composer card spanned it at 1220 px, still sharing the same
  left edge. A screenshot showed no horizontal scrolling, and the toolbar kept
  its spacing.
- Overriding `--file-line-width` with `500px` narrowed the transcript to 488 px
  and the composer card to 500 px, confirming that themes and snippets
  retuning the measure reach both. The setting was restored to on afterwards,
  and no console or plugin errors were captured.

### Show reasoning (2026-11-23)

Reasoning is now an opt-in **Show reasoning** setting, off by default and read
live by an open transcript. The protocol, tool rows, footnotes, execution
status, and stored data beyond one optional boolean are unchanged.

Live acceptance in the disposable test vault with the final local build,
confirmed by the user:

- An existing install whose plugin data predates the setting opened with
  reasoning hidden: no reasoning row, icon, preview, or body, while answers and
  tool rows kept their presentation.
- Enabling **Settings → OpenCode → Show reasoning** added folded reasoning rows
  to the already open transcript without reopening the view or reloading the
  plugin. Each row showed a one-line preview and expanded to its Markdown.
- Disabling it removed the reasoning rows immediately; answers and tool rows
  stayed, and the view kept its scroll position and expanded tool disclosures.
- Reopening chat and selecting another conversation followed the stored value,
  and the light and dark themes plus a narrow sidebar were unaffected.
- No accepted deviation, console error, or plugin error was reported.

### Session management drafts and chrome (2026-11-24)

Manual acceptance for `refactor-session-management` was performed by the user in
the disposable desktop test vault with the local build (`main.js` SHA-256
`963c53eba2a130aa07fa29a6f043dd671baba7025512d8fff9886a546f36d083`,
OpenCode 2.3.2, Obsidian 1.15.1). The user reported all checks passing:

- Opening chat showed a **New conversation** draft and created no server
  session. Sending the first message created exactly one session and sent the
  message to it.
- A draft renamed before sending kept that title on the created session.
- The draft showed its configured default agent and model, reused the last
  selected model and variant, and allowed changing agent, model, and thinking
  before the first send.
- The pane header and tab showed the draft/session title. Inline rename
  committed with Enter or blur, Escape restored the previous title, and an
  empty title was ignored.
- The native `opencode / sessions / title` breadcrumbs worked: **opencode**
  started a new draft, **sessions** opened the switcher, and the parent
  breadcrumbs collapsed while editing and returned afterwards.
- The document menu and tab menu offered **Switch conversation…**, **New
  conversation**, and **Rename conversation…**; switching and creating behaved
  as expected.
- Switching conversations while one was executing kept the previous session
  running; closing the view did not interrupt execution.
- No deviations, console errors, or plugin errors were reported.

## Chat link modifier navigation (2026-11-24)

Chat answers now follow Obsidian's pointer modifiers instead of always opening a
new tab. A plain click reuses an existing note tab, preferring one outside the
chat's tab group, and otherwise opens a tab beside the chat; Cmd/Ctrl+click
always opens a new tab in the chat's current tab group. Cmd/Ctrl+Alt+click opens
in one sticky note group beside the chat, and Cmd/Ctrl+Alt+Shift+click opens a
new window. The router uses the public `Keymap.isModEvent(event)` translation and
never navigates the chat leaf.

Known limitation: the **Always focus new tabs** preference is read through
`app.vault.getConfig('focusNewTab')`, which Obsidian's published typings and
plugin API do not declare. The read is runtime-guarded. When the method is
missing or throws, the plugin focuses the opened document, which matches the
default preference. An explicit `false` opens a new group document in the
background; an existing group tab is still focused. The note group is remembered
in memory only, so a plugin reload or Obsidian restart starts a fresh group
rather than adopting an existing one.

Automated coverage: `tests/markdown.test.mjs` asserts that each pane type reaches
the router's open callback and that unresolved or contextless links neither open
nor create a group. `tests/link-stack.test.mjs` covers first-use creation,
appending, dedupe with heading and block subpaths, recreation after close,
per-chat-tab scope, reserved note-tab selection, and the focus fallback. Live
Obsidian acceptance of each modifier row is still pending and is not claimed
here.

## Reading-view typography (2026-11-24)

The transcript now carries Obsidian's `markdown-preview-view` class, so answers
take the host's reading typography instead of the interface text they inherited
before. Measured live in the development vault on a loaded conversation, before
and after the change:

| | Before | After | A note's reading view |
| --- | --- | --- | --- |
| Text font | `--font-interface` | `--font-text` | `--font-text` |
| Text size | 15px | 16px | 16px |
| Line height | 19.5px (1.3) | 24px (1.5) | 24px (1.5) |
| Block padding | 12px / 16px | 32px (`--file-margins`) | 32px |
| Inline measure at a 1852px pane | 501px inset | 501px inset (850px column) | 850px column |
| Scrollbar gutter | default | `stable` | `stable` |

One spacing step governs the transcript: `var(--p-spacing)` (16px here)
separates prose blocks, a tool or reasoning group from the prose around it, and
both sides of a prompt, including where a server-side message split lands on a
group edge. No plugin spacing token remains. Rows inside a group still get no
margin, so a run of tool folds reads as one block instead of a stack of
paragraphs. Accepted trade-off: a turn break now measures the same as a
paragraph break, and the turn is signalled by its callout and the run footnote
rather than by extra space. With **Readable line length** off, the
transcript and composer both measured 32px inline padding and stayed aligned.
The view root no longer declares text colour, background, or base font size;
both were read from the pane after the change.

The user prompt is now a prompt-type callout rather than a blockquote: measured
live at 12px/12px/12px/24px padding, 4px radius, the host default callout tint,
a blue **You** title with a pencil icon, and `white-space: pre-wrap` preserved.
Its outer margin is not usable: the host zeroes `:first-child`/`:last-child`
margins and the callout is the only child of its `markdown-rendered` frame, so
the `margin: 1em 0` that `.callout` declares never applies. The turn boundary
therefore carries the space instead, using the same `--p-spacing` step as prose:
measured 16px above and 16px below a prompt. The box, title colour, and padding come from
the host callout rules.

Deviation from the documented check: no disposable test vault exists on this
machine, so the live pass ran in the development vault where the plugin is
already installed (`main.js`, `manifest.json`, and `styles.css` copied and the
plugin reloaded). The disposable-vault pass remains outstanding, as does the
representation check with a non-default theme.

The list markers needed the same treatment. Obsidian draws a note's bullet as a
`.list-bullet::after` on a span it injects while building a reading-view preview,
with `has-list-bullet` on the list and `list-style-type` set to a zero-width
space; `MarkdownRenderer.render` returns none of that. The transcript now
reproduces the structure, measured side by side in the vault:

| | Chat bullet | Note bullet |
| --- | --- | --- |
| List class | `has-list-bullet` | `has-list-bullet` |
| Bullet spans | 4 of 4 items | 4 of 4 items |
| Marker colour | `#ababab` (`--list-marker-color`) | `#ababab` |
| Marker size | 4.8px | 4.8px |
| Marker radius | 50% | 50% |

Ordered lists keep their numbers and task lists keep their checkboxes; both are
asserted rather than assumed.

Automated coverage: `tests/plugin-shell.test.mjs` asserts the reading-view class
on the transcript; `tests/conversation.test.mjs` asserts the prompt callout type,
icon, title, preserved newlines, and that no blockquote renders for the prompt or
the answer; `tests/markdown.test.mjs` asserts the list pass on a final and on a
throttled render, the nested list, and that ordered and task lists are left
alone; and `tests/style-contract.test.mjs` asserts that the root declares layout
only, that the transcript defers padding to the host, that prose seams, detail
groups and turns use `--p-spacing` with no plugin spacing token, that a group's
rows stay tight, and that the reading measure uses `--file-margins-x`.

## Subagent result embeds (2026-11-24)

Subagent reports now render at their transcript position as an attributed native
Markdown embed instead of a collapsed **Synthetic note**. Live acceptance used
the local build in the disposable `obsidian-test-vault` and, at the user's
request, in the 7,042-note development vault, with Obsidian 1.15.1, Electron
43.8.9, Node 24.22.1, and managed OpenCode 2.3.2.

- A real `task` delegation to the **Explore** subagent produced a `synthetic`
  record with `metadata.source: "subagent"`, `agent: "Explore"`,
  `state: "completed"`, `childID`, and the task description in the record's own
  `description` field. The transcript showed `Explore subagent · Read HOME and
  report` as the embed title at the record's place; the disposable-vault run
  showed `Explore subagent · Summarize acceptance example`.
- The report rendered as Markdown inside `internal-embed markdown-embed
  inline-embed is-loaded` with an `embed-title markdown-embed-title` and a
  `markdown-embed-content` body. Neither `<subagent …>` nor `</subagent>`
  appeared in the embed. The parent tool result separately mentions
  `<subagent>` as prose; that is tool output, not the report envelope. No custom
  caption or blockquote remains.
- `[[HOME]]` and `[[Acceptance/Example]]` rendered as internal links in the
  embed. Activating the `HOME` link opened `HOME.md` in a note tab and left the
  chat leaf intact.
- A plan-mode injected **Synthetic note** elsewhere in the same conversation
  stayed a closed disclosure with its text in plain `<pre>` and no Markdown
  frame. These runs produced no `skill` or `system` record, so their identical
  disclosure path is covered by `tests/conversation.test.mjs` rather than
  observed live.
- Measured in the disposable vault with **Readable line length** on and off in
  light and dark themes, the subagent embed matched a live
  `![[Acceptance/Example]]` note embed: the same classes, a transparent
  background, a `2px` inline-start border (`rgb(152,115,247)` light,
  `rgb(138,92,245)` dark), a `16px`/`600` title (`rgb(34,34,34)` light,
  `rgb(218,218,218)` dark), title padding `0 0 0 24px`, the host
  `--embed-max-height` (`4000px` here) with `overflow: auto`, and `24px` preview
  padding. The subagent message measured `16px` (`--p-spacing`) above and below,
  and no doubled margin appeared at its bottom.
- The service places the task description on the record rather than in
  `metadata`; the renderer reads both, and the change artifacts were corrected
  to match the live payload.
- Automated verification after the change: `npm test` passed 265 tests,
  `npm run build` succeeded, and `npm run lint` reported 0 errors and the same
  two pre-existing warnings (declarative settings API; sentence case for
  **OpenCode 2 executable path**).

## Top-level session switcher (2026-11-24)

The conversation switcher now lists only the vault's top-level conversations.
Live acceptance used the local build in the disposable `obsidian-test-vault` with
Obsidian 1.15.1, Electron 43.8.9, Node 24.22.1, and a managed OpenCode 2.3.2.

- One real `task` delegation to the **Explore** subagent produced a child session
  titled **Read HOME heading**, and its report still rendered in the parent
  transcript as `internal-embed markdown-embed inline-embed is-loaded` titled
  **Explore subagent · Read HOME heading**.
- Opening the switcher showed seven rows — **Explore subagent heading task**
  marked **Current** plus six earlier top-level conversations — and no row
  carried a subagent's task title.
- Immediately afterwards the same client returned **9 sessions** for the vault
  directory, **2 of them children** carrying a `parentID` (**Read HOME heading**
  and **Summarize acceptance example**), while the coordinator listed **7**,
  exactly the switcher's rows.
- The switcher was opened through the view's own switcher action, the method
  behind the document menu item and the **sessions** breadcrumb, rather than a
  mouse click on either surface.
- Limitation: one vault and one delegation. A nested grandchild was not produced
  live and is covered by `tests/sessions.test.mjs` and
  `tests/session-switcher.test.mjs` instead; archived and forked sessions were
  not part of this run and keep their previous behaviour.

| Date | Change | Tasks | Tests | Build | Archive |
| --- | --- | --- | --- | --- | --- |
| 2026-11-24 | `hide-subagent-sessions` | 5/5 | 266 passing | pass | `openspec/changes/archive/2026-11-24-hide-subagent-sessions` |
| 2026-11-24 | `render-subagent-quotes` | 8/8 | 265 passing | pass | `openspec/changes/archive/2026-11-24-render-subagent-quotes` |
| 2026-11-24 | `adopt-reading-view-typography` | 16/16 | 260 passing | pass | `openspec/changes/archive/2026-11-24-adopt-reading-view-typography` |
| 2026-11-24 | `chat-link-stack` | 12/12 | 253 passing | pass | `openspec/changes/archive/2026-11-24-chat-link-stack` |
| 2026-11-24 | `refactor-session-management` | 20/20 | 242 passing | pass | `openspec/changes/archive/2026-11-24-refactor-session-management` |
| 2026-11-23 | `add-reasoning-visibility-setting` | 13/13 | 224 passing | pass | `openspec/changes/archive/2026-11-23-add-reasoning-visibility-setting` |
| 2026-11-23 | `streamline-chat-transcript` | 15/15 | 216 passing | pass | `openspec/changes/archive/2026-11-23-streamline-chat-transcript` |
| 2026-11-23 | `add-composer-slash-commands` | 19/19 | 207 passing | pass | `openspec/changes/archive/2026-11-23-add-composer-slash-commands` |
| 2026-11-22 | `reuse-obsidian-ui-styles` | 14/14 | 163 passing | pass | `openspec/changes/archive/2026-11-22-reuse-obsidian-ui-styles` |
| 2026-11-22 | `add-composer-note-linking` | 9/9 | 161 passing | pass | `openspec/changes/archive/2026-11-22-add-composer-note-linking` |
| 2026-11-22 | `add-composer-skill-mentions` | 16/16 | 183 passing | pass | `openspec/changes/archive/2026-11-22-add-composer-skill-mentions` |
