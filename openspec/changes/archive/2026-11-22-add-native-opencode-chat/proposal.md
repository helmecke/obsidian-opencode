# Proposal

## Why

Working with OpenCode and an Obsidian vault currently requires switching applications, and wikilinks in terminal answers cannot be opened directly in Obsidian. A native chat view should bring OpenCode into the vault interface without reproducing its terminal UI.

## What Changes

- Replace the sample-plugin experience with a desktop-only OpenCode plugin and a movable, theme-aware Obsidian chat view.
- Render streamed Markdown answers with actionable vault wikilinks that open notes without replacing the chat.
- Automatically discover and reuse a compatible already-running local OpenCode service when chat opens, using the current vault as the session workspace. Users start OpenCode outside Obsidian; automatic service startup is a follow-up, not a requirement of this change.
- Replace the exact OpenCode 2.2.2 runtime restriction with the broadest validated 2.x range, targeting `>=2.2.2 <3.0.0` if contract verification supports it. Verify installed OpenCode 2.3.2 explicitly and distinguish version eligibility from API compatibility; do not claim every future 2.x release has been tested.
- Support creating and resuming conversations, selecting agents and models, stopping execution, inspecting tool activity, answering forms, and responding to permission requests.
- Recover conversation state after connection loss and release client resources without stopping the shared service.
- Document installation, local service access, model-provider data flow, permission boundaries, and known compatibility constraints.
- Exclude terminal emulation, embedded SDK hosting, mobile support, remote-server configuration, automatic OpenCode installation, custom vault workflows, automatic editor-context attachment, and guaranteed CLI/GUI handoff from this first change.

## Capabilities

### New Capabilities

- `native-chat`: Native view, conversation controls, execution feedback, agent/model selection, and view lifecycle.
- `vault-link-navigation`: Obsidian Markdown rendering and wikilink navigation with stable link context.
- `local-opencode-connection`: Lazy authenticated service discovery/reuse, vault-scoped sessions, connection recovery, and client cleanup.
- `agent-interactions`: Tool activity, permission decisions, and structured agent forms within the chat.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

- Adapt `src/main.ts`, `src/settings.ts`, `styles.css`, plugin/package metadata, version mapping, and README; introduce focused UI, connection, session-state, and interaction modules under `src/`.
- Add and bundle a pinned `@opencode/client` dependency using the existing npm/esbuild toolchain. OpenCode remains a separately installed local runtime.
- Add automated coverage for state/event processing, reconnection, interactions, and link routing, plus documented in-Obsidian acceptance checks.
- Validate Electron/Node compatibility, local streaming transport, and the supported OpenCode version range before treating the integration as release-ready.
- Revisit compatibility policy, discovery/API validation, regression tests, and supported-version documentation. Keep the client dependency pinned; change its pinned version only if contract verification requires it. Broader runtime eligibility must not weaken authentication, service identity checks, interaction validation, or shared-service ownership protections.
- Automatic startup is deferred outside this change in [GitHub issue #1](https://github.com/helmecke/obsidian-opencode/issues/1). The accepted workflow requires an already-running compatible service; startup debt does not block task 2.2 or release of that workflow. All other implementation and acceptance requirements remain. Executable-path settings are retained as inactive future configuration, not a working launcher.
- No raw vault content or filenames are uploaded by development or proposal creation. At runtime, explicit chat requests can cause OpenCode to read or change files and send context to configured providers according to its configuration and permissions.
