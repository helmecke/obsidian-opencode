# Proposal

## Why

Working with OpenCode and an Obsidian vault currently requires switching applications, and wikilinks in terminal answers cannot be opened directly in Obsidian. A native chat view should bring OpenCode into the vault interface without reproducing its terminal UI.

## What Changes

- Replace the sample-plugin experience with a desktop-only OpenCode plugin and a movable, theme-aware Obsidian chat view.
- Render streamed Markdown answers with actionable vault wikilinks that open notes without replacing the chat.
- Automatically discover or start a compatible local OpenCode service when chat opens, using a separately installed executable and the current vault as the session workspace.
- Support creating and resuming conversations, selecting agents and models, stopping execution, inspecting tool activity, answering forms, and responding to permission requests.
- Recover conversation state after connection loss and release client resources without stopping the shared service.
- Document installation, local service access, model-provider data flow, permission boundaries, and known compatibility constraints.
- Exclude terminal emulation, embedded SDK hosting, mobile support, remote-server configuration, automatic OpenCode installation, custom vault workflows, automatic editor-context attachment, and guaranteed CLI/GUI handoff from this first change.

## Capabilities

### New Capabilities

- `native-chat`: Native view, conversation controls, execution feedback, agent/model selection, and view lifecycle.
- `vault-link-navigation`: Obsidian Markdown rendering and wikilink navigation with stable link context.
- `local-opencode-connection`: Lazy authenticated service startup, vault-scoped sessions, connection recovery, and client cleanup.
- `agent-interactions`: Tool activity, permission decisions, and structured agent forms within the chat.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

- Adapt `src/main.ts`, `src/settings.ts`, `styles.css`, plugin/package metadata, version mapping, and README; introduce focused UI, connection, session-state, and interaction modules under `src/`.
- Add and bundle a pinned `@opencode/client` dependency using the existing npm/esbuild toolchain. OpenCode remains a separately installed local runtime.
- Add automated coverage for state/event processing, reconnection, interactions, and link routing, plus documented in-Obsidian acceptance checks.
- Validate Electron/Node compatibility, local streaming transport, Windows executable startup, and the supported OpenCode version range before treating the integration as release-ready.
- No raw vault content or filenames are uploaded by development or proposal creation. At runtime, explicit chat requests can cause OpenCode to read or change files and send context to configured providers according to its configuration and permissions.
