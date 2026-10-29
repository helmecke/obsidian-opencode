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

Bundle a pinned `@opencode/client` version. Use `OpenCode.make` for requests and `@opencode/client/service` for discovery, startup, and authentication. Initialize only when chat is opened. Deduplicate concurrent initialization within the plugin. Reuse a compatible healthy registered service; inspect compatibility before any ensure operation that might replace an incompatible instance. If compatibility cannot be established safely, report the issue rather than restarting the shared service.

Use the installed `opencode` command by default and offer an executable-path setting. Pass executable and arguments separately, never concatenate shell fragments. Do not add arbitrary shell-command or remote-URL settings in this change. If Windows launcher handling needs a platform-specific adapter, keep it isolated and test spaces and argument injection explicitly.

Choose the supported runtime range from tested behavior; do not assume all `2.x` versions support the same form and event contract. Record the tested range in README and check it at connection time. Keep discovery credentials transient and out of persisted settings and logs.

**Alternatives:** Embedded SDK hosting avoids HTTP but includes core/server dependencies and has no documented Obsidian/Electron compatibility guarantee. Terminal embedding violates the desired UI. Manual server startup violates the automatic-availability requirement.

### 2. Split presentation, state, and connection ownership

Proposed module boundaries:

```text
src/main.ts                 Plugin lifecycle and registration
src/settings.ts             Executable path and settings UI
src/opencode/connection.ts  Local service and authenticated transport
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

Use the API's pending permission lists and `session.permission.reply` with `once`, `always`, and `reject`. Display action, resources, and persistent-save scope; persistent approval must be explicit. Do not edit permission configuration. Disable duplicate submission and refresh after errors or an already-settled response.

Agent questions use the v2 form API, not a guessed question endpoint. Render the pinned schema's string/choice, multiselect, numeric, integer, boolean, and external-link fields. Honor required/visibility constraints, expose cancellation, and validate server-side errors visibly. Unsupported future fields produce a clear compatibility error instead of partial submission. External links require an explicit click and safe URL handling.

Show tool calls as expandable entries using available IDs and lifecycle events. Treat output as data. Refresh interactions after reconnect so another client's decisions remove stale controls.

### 7. Make compatibility a release gate

Before investing in the full UI, prove the pinned client and service entry point bundle and execute in Obsidian's Electron/Node environment, including local authenticated streaming. The client permits custom `fetch`; choose an in-process Node transport if the browser-origin path is unsuitable, rather than silently changing global CORS configuration or disabling authentication. If neither documented entry point works in the target runtime, stop and revise the design rather than quietly switching to SDK embedding.

Use lightweight automated tests for transport abstraction, state reduction/recovery, prompt identity, link-routing decisions, and interaction payloads. Manual Obsidian checks cover renderer behavior, actual link resolution, theme changes, pane moves, and real provider/tool conversations. Select an honest `minAppVersion` based on APIs used and tested runtime; the template's 1.0.0 is not a compatibility claim.

## Risks / Trade-offs

- [Electron service helper compatibility is unproven] -> Gate implementation with a minimal bundle/runtime check and isolate native transport/startup adapters.
- [GUI-launched Obsidian has a different PATH] -> Configurable executable path, quoted-path tests, actionable errors; no automatic installation.
- [Client and installed runtime evolve independently] -> Pin the client, test a concrete runtime range, and reject unsupported versions without restarting another client's service.
- [Snapshots race with stream deltas] -> Buffered reconciliation tests, stable identities, bounded queues, and authoritative reload on uncertainty.
- [Rendering is slower than event production] -> Separate event consumption from batched Markdown rendering and recover after overflow.
- [Vault-root workspace is mistaken for isolation] -> Preserve configured permissions and disclose external-directory and provider access explicitly.
- [Closing a pane leaves work running] -> Show this lifecycle clearly; provide explicit stop and restore current execution state on reopen.

## Migration Plan

This is an unreleased sample repository: no existing plugin-user data migration is required. During implementation, replace sample identifiers with `opencode` / `OpenCode`, set desktop-only operation, update package identity and version mapping consistently, and remove demo actions. Preserve the existing build/lint toolchain.

Build and lint, run automated tests, then manually install the generated `main.js`, `manifest.json`, and `styles.css` into a disposable test vault after explicit agreement on the test location. Test Windows first and record any untested macOS/Linux behavior instead of claiming coverage. Installing into the user's real vault is not implied by this proposal. Do not commit generated bundles or dependencies.

Rollback consists of disabling/removing the plugin through Obsidian and reverting only the plugin implementation through normal version control. It must not delete or rewrite OpenCode's service files, database, or conversations. The shared service remains separately managed by OpenCode.
