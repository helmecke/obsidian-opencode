# Design

## Context

See `proposal.md` for motivation and scope. This repository still contains the sample `Plugin` entry point, sample settings, placeholder CSS, and sample metadata. Its npm scripts provide TypeScript checking, esbuild bundling, and Obsidian-specific ESLint; there is no existing chat state or test suite. esbuild currently emits CommonJS targeting ES2021 and externalizes Obsidian, Electron, and Node built-ins.

The v2 client documentation provides a browser-compatible Promise client and a separate Node service-management entry point. Both `@opencode/client` and `@opencode/sdk` were published as 2.2.2 at investigation time. These are published interfaces, not evidence of tested Electron compatibility. Sources:

- https://opencode.ai/v2/docs/build/client/
- https://opencode.ai/v2/docs/build/sdk/
- https://opencode.ai/v2/openapi.json
- https://opencode.ai/v2/docs/troubleshooting/
- https://opencode.ai/v2/docs/permissions/
- https://registry.npmjs.org/@opencode%2Fclient

## Goals / Non-Goals

**Goals:**
- Separate Obsidian presentation from transport and authoritative session state.
- Make reconnection and human decisions first-class rather than building a text-only chat demo.
- Keep dependency weight, plugin startup work, and credential handling small.

**Non-Goals:**
- Do not implement another agent runtime, permission engine, provider-authentication UI, or transcript database.
- Do not translate terminal UI components or require a custom OpenCode server plugin.
- Do not change the user's OpenCode or vault instructions/configuration.

## Decisions

### 1. Use the generated client and shared local service

Bundle pinned `@opencode/client` 2.2.2 as the current baseline; update the pin only if the compatibility review establishes that a newer client is required. Runtime version eligibility is separate from the client dependency pin. Use `OpenCode.make` with a plugin-local Node HTTP fetch adapter for requests and live events. Bridge Node response bodies to Web `ReadableStream` with backpressure, cancellation, and request abort handling. Do not globally override fetch, change service CORS settings, or introduce a helper process. Initialize only when chat is opened and deduplicate concurrent initialization within the plugin.

Use a narrow, read-only discovery adapter instead of the renderer's `Service.discover`. Read the standard registration path supplied by the pinned client's exported `fallback()` and validate the published `Info` shape at runtime. Keep this version-specific logic isolated. Use `Service.headers` for transient Basic authentication and the generated client for authenticated health requests. Bound registration and health-response sizes and request duration. Accept only literal loopback HTTP endpoints (`127.0.0.1` or `::1`) with no embedded URL credentials, path, query, or fragment; reject redirects and other destinations before sending credentials. Bind subsequent requests to the validated service origin.

Reuse only a healthy service whose reported PID and version match its registration and whose version is supported. Re-read registration after probing; changed service identity or credentials require rediscovery before admitting the connection. Distinguish an absent registration from malformed, unreadable, unauthenticated, unhealthy, incompatible, or identity-mismatched registrations. The latter are actionable errors, not permission to start or replace a service. This preserves the standard registration-file/local-user trust model; PID matching and loopback restrictions do not defend against a malicious process running as the same OS user.

Do not call `Service.ensure` in the renderer: its internal probe still uses browser fetch, and its published implementation can stop and replace a service after version mismatch or repeated probe timeouts. This change connects only to an already-running service. Users start OpenCode outside Obsidian; genuine registration absence produces actionable feedback and explicit discovery retry without launching a process. Plugin cleanup must never stop the shared service.

**Technical debt decision (2026-10-30):** Defer automatic startup outside this change in [GitHub issue #1](https://github.com/helmecke/obsidian-opencode/issues/1), not another task in this plan. The user accepted external service startup to prioritize a usable plugin. Startup is no longer a task 2.2 or release gate for this workflow. Non-replacement remains mandatory: the plugin neither launches replacement services nor edits shared registration/configuration. All remaining chat, transport, security, and acceptance requirements still apply.

**Evidence (source review, not a destructive live test):** In 2.2.2, `service start` delegates to `Service.ensure`. Direct `serve --service` checks for an incumbent at its configured URL and handles bind conflicts, but registration publication uses a replacing rename rather than atomic exclusive ownership. A late service on another port is not protected by that bind check; overwriting its registration can cause its registration watcher to shut it down. A plugin-only mutex or lock cannot coordinate other clients that do not honor it. Comparison with released 2.2.4 on 2026-10-30 found the CLI startup, registration, service-start handler, and Promise service-helper source files unchanged. This does not establish 2.2.4 API/Electron compatibility; the supported runtime remains exactly 2.2.2 until separately verified.

Issue #1 owns future startup implementation and acceptance: verify upstream released exclusive ownership, same-port/different-port and incompatible-incumbent races, executable version/path handling, startup failures, retry, and redaction using isolated tests. Revalidate client/registration/API compatibility and the Electron transport before changing supported versions. Do not infer that a newer release or an ownership-lock proposal alone resolves that issue. Those criteria are not required to close task 2.2's revised discovery-only scope.

**Evidence and compatibility boundary:** In the approved disposable vault, Obsidian 1.14.5 / Electron 43.8.3 / embedded Node 24.22.0 loads the bundled client but renderer fetch fails with `TypeError: Failed to fetch`. The in-process Node HTTP probe discovers OpenCode 2.2.2 from registration, verifies PID/version, receives authenticated API responses and `server.connected`, and observes HTTP 401 without authentication. This validates the transport experiment, not automatic startup or full conversation acceptance. See `docs/runtime-compatibility.md` for reproducible probe details. The exact renderer failure cause remains unconfirmed.

Web verification for this decision:

- [OpenCode V2 client guide](https://opencode.ai/v2/docs/build/client): documents custom fetch injection and Node-only service management, but does not document custom fetch injection into service discovery.
- [OpenCode V2 troubleshooting](https://opencode.ai/v2/docs/troubleshooting/#service-files): documents the registration path and warns against editing service files; changing service CORS configuration stops the service and is not this plugin's workaround.
- [Published 2.2.2 registration types](https://unpkg.com/@opencode/client@2.2.2/dist/service.d.ts) and [probe implementation](https://unpkg.com/@opencode/client@2.2.2/dist/chunks/pty-handoff-8ye1ye6f.js): establish the pinned registration/authentication/PID/version contract. Reading that format is a version-specific integration, not a promise of compatibility with future releases.
- [Published 2.2.2 service helper](https://unpkg.com/@opencode/client@2.2.2/dist/promise/service.js): confirms replacement behavior in `ensure`; it is not a safe renderer fallback.
- [2.2.2 CLI service start](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/commands/handlers/service/start.ts), [server startup](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/server-process.ts), and [registration publication/watcher](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/services/service-registration.ts): establish the reviewed startup safety gap. This is source analysis, not a live destructive race test.
- [Upstream PR #35826: elect one managed daemon](https://github.com/anomalyco/opencode/pull/35826): proposes a channel-scoped process-lifetime ownership lock before service construction. GitHub's API reported it closed without merging on 2026-10-29; it is evidence of a proposed approach, not an available fix or proof of mixed-version safety.
- [ChatGPT-MD Node HTTP stream adapter](https://raw.githubusercontent.com/bramses/chatgpt-md/develop/src/Services/requestStream.ts): demonstrates the in-process Node response-to-Web-stream pattern in an Obsidian plugin. It supports the transport choice, not the OpenCode-specific discovery implementation.

Retain the executable-path setting as inactive future configuration and disclose that it performs no lookup, executable validation, or launch. Preserve spaces as path data, reject NUL/line breaks, and never evaluate the setting as a shell command. Actual executable lookup, missing-executable errors, Windows launcher handling, and argument-injection tests belong to issue #1. Do not add arbitrary shell-command or remote-URL settings in this change.

**Compatibility revision (2026-11-22):** The user approved replacing exact-version matching with broader validated OpenCode 2.x eligibility. Target `>=2.2.2 <3.0.0` if contract review and regression evidence support that range, with explicit verification of installed CLI 2.3.2 and the 2.2.2 baseline. An installed CLI version is not evidence of the running service's version or API compatibility. The earlier exact-2.2.2 statements above describe historical evidence and the current implementation, not the revised target. No new runtime is verified by this planning decision.

Before changing the gate, compare the registration, authentication, required API endpoints and payloads, event identities/order, prompt identity, permission decisions, and form contracts across the baseline and 2.3.2. Keep version parsing strict; test lower/upper boundaries, malformed values, and a documented prerelease/build-metadata policy. A broad version range is an eligibility policy, not a claim that every future release is tested. If evidence cannot support the target range, report the limitation before adopting a narrower policy or dropping specified behavior.

Distinguish version rejection from API/schema incompatibility within an eligible version. Preserve bounded read-only discovery, authenticated health and identity verification, and validate required response shapes during initial synchronization before enabling sends and decisions. Surface unsupported endpoints or incompatible payloads as actionable compatibility errors, not absence or successful empty state. Do not send speculative prompts or permission decisions to probe compatibility. Continue to reject unsupported form fields without partial submission. Contract changes requiring adapters or a new client pin must preserve all existing conversation and interaction requirements.

Record the eligible range, individually tested versions, and remaining coverage limitations separately in README and developer documentation. Re-run the production Electron discovery/authentication/streaming gate and full acceptance workflow against the actual compatible running service. Keep discovery credentials transient and out of persisted settings and logs. Broader eligibility never permits service startup, replacement, configuration changes, or authentication bypass.

#### OpenChamber reference review (2026-11-22)

The user uses OpenChamber and requested its source as an integration reference. The reviewed upstream snapshot is [commit `30c70496a5ca0105e04e60a783964576973edc8f`](https://github.com/openchamber/openchamber/tree/30c70496a5ca0105e04e60a783964576973edc8f), not a verified identification of the user's installed OpenChamber build.

- [`package.json`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/package.json) pins `@opencode/client` to 2.3.2; [`packages/electron/package.json`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/electron/package.json) pins its bundled `@opencode/server` to 2.3.2. These are source dependency declarations, not this plugin's runtime acceptance results.
- [`packages/web/server/lib/opencode/compatibility.ts`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/web/server/lib/opencode/compatibility.ts) checks major version 2 and a minimum release of 2.2.4 rather than exact equality. Its handling of prereleases/build metadata is an implementation choice to review, not automatically our policy. This is evidence to investigate the lower bound; it neither proves 2.2.2 incompatibility nor authorizes silently narrowing the approved provisional target.
- [`packages/ui/src/lib/opencode/client.ts`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/ui/src/lib/opencode/client.ts) uses `permission.request.list` and `form.list` for directory-scoped pending interactions, `permission.reply` for permission decisions, and `session.form.reply` / `session.form.cancel` for forms. Compare these with the pinned client's session-scoped listing methods and actual service contracts; different call sites alone do not prove an older endpoint was removed. Review directory header encoding, response validation, and capability checks before changing adapters.
- [`packages/ui/src/lib/opencode/wire-admission.ts`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/ui/src/lib/opencode/wire-admission.ts) and [`packages/ui/src/sync/event-pipeline.ts`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/ui/src/sync/event-pipeline.ts) provide references for event-envelope validation, stale execution-boundary handling, batching, and reconnects. OpenChamber's proxy-specific WebSocket replay is not evidence that direct OpenCode subscriptions replay events; retain authoritative snapshot reconciliation.
- [`packages/web/server/lib/opencode/shared-service.ts`](https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/web/server/lib/opencode/shared-service.ts) can call `ensure` and replace an older shared service. Do not copy that lifecycle policy. Likewise, its embedded server, proxy, and automatic trust-handling paths are not adopted by this plan. Preserve this plugin's read-only discovery and permission boundaries.

Use these references to guide task 1.3's contract comparison and regression fixtures, not to mark compatibility complete. Verify coexistence with the user's OpenChamber client in the disposable-vault acceptance run without replacing its service or changing registration/configuration.

**Alternatives:** Embedded SDK hosting avoids HTTP but includes core/server dependencies and has no documented Obsidian/Electron compatibility guarantee. Terminal embedding violates the desired UI. External service startup is the accepted trade-off for this change; automatic availability remains a follow-up enhancement.

### 2. Split presentation, state, and connection ownership

Proposed module boundaries:

```text
src/main.ts                 Plugin lifecycle and registration
src/settings.ts             Executable path and settings UI
src/opencode/connection.ts  Local service and authenticated transport
src/opencode/discovery.ts   Pinned read-only registration and health validation
src/opencode/node-fetch.ts  Origin-bound Node HTTP and Web stream bridge
src/opencode/sessions.ts    Session operations and authoritative reload
src/state/                 Event reduction and recovery coordination
src/ui/chat-view.ts         ItemView composition and controls
src/ui/markdown.ts          Markdown lifetime and link routing
src/ui/interactions.ts      Tool entries, forms, and permission controls
```

Use a regular `ItemView`, native DOM helpers/components, and scoped CSS with Obsidian variables. No UI framework is necessary initially. Keep `main.ts` small. Route user-visible errors through the view, not repeated global notices.

The plugin owns the connection coordinator and session state; views own rendering components and DOM handlers. Closing a view releases its rendering resources but does not interrupt execution. With no views, the plugin may suspend event consumption and recover on reopen. Plugin unload aborts subscriptions/retries and removes handlers without calling `Service.stop` or `session.interrupt`. An explicit stop action calls `session.interrupt`.

**Alternative:** Owning the agent loop from the view would make moving or closing a pane alter execution and make reliable resumption harder.

### 3. Let OpenCode own transcripts and execution

Create sessions with the current desktop vault's absolute filesystem path in `location.directory`; use location-scoped configuration and agent/model listings. Restrict the conversation picker to the current vault and verify a restored session still belongs there. Ignore unrelated session events, including those from other projects on the shared service.

Persist only executable settings, selected session ID, and stable link-source metadata through Obsidian plugin data. Do not store credentials or duplicate transcripts there. Use server-confirmed agent/model selection rather than optimistic permanent changes.

Use stable prompt IDs where the pinned API supports them. Retain drafts until admission is confirmed. For uncertain admission, reconcile by identity before allowing retry; never blindly replay a prompt with a new ID.

**Alternative:** Plugin-managed transcripts would diverge from OpenCode after compaction, external interactions, or connection loss.

### 4. Treat events as volatile notifications

The documented stream has no replay or automatic reconnection; it spans server locations and can fail for slow consumers. Consume quickly into a bounded event queue and update presentation in batches, not by awaiting Markdown rendering inside the subscription loop.

On initial connection and reconnection, establish subscription and buffer relevant events while loading authoritative messages, active execution, permissions, and forms. Apply a tested reconciliation strategy based on the pinned schema's IDs/ordering so buffered deltas cannot duplicate text already present in a snapshot. When ordering is uncertain or a buffer overflows, discard the partial projection and fetch fresh authoritative state rather than guessing. Gate sends and decisions during reconciliation. Use bounded exponential backoff with a delay cap, visible retry state, and explicit manual retry after the retry budget is exhausted.

Cover this with deterministic fixtures, especially completion during disconnection and events arriving during snapshot retrieval. Reconnection must not rely on undocumented SSE replay.

**Alternative:** A stream-only UI silently misses completion and approval requests while disconnected. Polling alone loses the desired streaming experience.

### 5. Use Obsidian rendering and explicit internal-link navigation

Render answers with `MarkdownRenderer` using child component lifetimes that are unloaded when replaced or removed. Throttle streaming re-renders and perform a final render on completion. Do not scan terminal text or code blocks with wikilink regular expressions.

Resolve internal links through Obsidian's link parsing and metadata cache, then open resolved targets in a non-chat leaf via workspace navigation. Preserve display aliases, vault paths, heading and block subpaths, and normal modifier-key navigation where compatible with retaining chat. Check existence before opening so unresolved links do not create notes.

The first version does not attach editor context; use vault-root-relative resolution for conversations without an explicit source note. Retain this stable context across active-editor changes and reopening. Contextless self-references such as `[[#Heading]]` cannot identify a target note and must fail non-destructively rather than use whichever note happens to be active.

Hover previews are deferred; they are not needed for the initial navigation contract. Native Markdown output is not a license to trust tool output or execute arbitrary generated HTML/scripts; avoid custom HTML injection and automatic network fetching introduced by the plugin.

### 6. Implement permissions and forms as stateful interactions

Use the API's pending permission lists and `permission.reply` with `once`, `always`, and `reject`. Display action, resources, and persistent-save scope; persistent approval must be explicit. Do not edit permission configuration. Disable duplicate submission and refresh after errors or an already-settled response.

Agent questions use the v2 form API, not a guessed question endpoint. Render the pinned schema's string/choice, multiselect, numeric, integer, boolean, and external-link fields. Honor required/visibility constraints, expose cancellation, and validate server-side errors visibly. Unsupported future fields produce a clear compatibility error instead of partial submission. External links require an explicit click and safe URL handling.

Show tool calls as expandable entries using available IDs and lifecycle events. Treat output as data. Refresh interactions after reconnect so another client's decisions remove stale controls.

### 7. Make compatibility a release gate

Before investing in the full UI, prove the pinned client and service entry point bundle and execute in Obsidian's Electron/Node environment, including local authenticated streaming. The initial gate demonstrated the need for the Node transport and read-only discovery adaptation described in decision 1. Automated coverage must include unsafe origins and redirects, malformed registrations, authentication failures, identity/credential changes during discovery, abort/stream cancellation, and incompatible-service non-replacement. Re-run the Electron gate against production adapters rather than assuming the disposable probe proves their correctness. If the adapted local client approach fails, stop and revise the design rather than quietly switching to SDK embedding.

Use lightweight automated tests for transport abstraction, state reduction/recovery, prompt identity, link-routing decisions, and interaction payloads. Manual Obsidian checks cover renderer behavior, actual link resolution, theme changes, pane moves, and real provider/tool conversations. Select an honest `minAppVersion` based on APIs used and tested runtime; the template's 1.0.0 is not a compatibility claim.

## Risks / Trade-offs

- [Renderer service discovery fails and registration format is version-specific] -> Use the tested Node transport and pinned read-only discovery adapter, validate registration and service identity, and reject unsupported versions. Never treat failed probing as an absent service or permission to replace it.
- [Users must start OpenCode outside Obsidian] -> Document the existing-service workflow and discovery retry; track automatic startup in issue #1, outside this change. Do not claim the retained executable setting launches a service.
- [Client and installed runtime evolve independently] -> Pin the client, validate the broadest defensible 2.x runtime range, distinguish version eligibility from API compatibility, and report incompatible contracts without restarting another client's service. Document tested releases separately from future-version eligibility.
- [Snapshots race with stream deltas] -> Buffered reconciliation tests, stable identities, bounded queues, and authoritative reload on uncertainty.
- [Rendering is slower than event production] -> Separate event consumption from batched Markdown rendering and recover after overflow.
- [Vault-root workspace is mistaken for isolation] -> Preserve configured permissions and disclose external-directory and provider access explicitly.
- [Closing a pane leaves work running] -> Show this lifecycle clearly; provide explicit stop and restore current execution state on reopen.

## Migration Plan

This is an unreleased sample repository: no existing plugin-user data migration is required. During implementation, replace sample identifiers with `opencode` / `OpenCode`, set desktop-only operation, update package identity and version mapping consistently, and remove demo actions. Preserve the existing build/lint toolchain.

Build and lint, run automated tests, then manually install the generated `main.js`, `manifest.json`, and `styles.css` into a disposable test vault after explicit agreement on the test location. Test Windows first and record any untested macOS/Linux behavior instead of claiming coverage. Installing into the user's real vault is not implied by this proposal. Do not commit generated bundles or dependencies.

Rollback consists of disabling/removing the plugin through Obsidian and reverting only the plugin implementation through normal version control. It must not delete or rewrite OpenCode's service files, database, or conversations. The shared service remains separately managed by OpenCode.
