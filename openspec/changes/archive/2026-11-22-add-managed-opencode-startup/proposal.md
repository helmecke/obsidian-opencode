# Proposal

## Why

The plugin can only reuse an already-running OpenCode service, so a user must start OpenCode outside Obsidian before chat works. When a shared service is absent or its registration is stale, the plugin has nothing healthy to discover even though an OpenCode 2 CLI is installed. Starting a plugin-owned process removes that manual step while keeping the shared-service path as the first choice.

## What Changes

- Add a plugin-managed private OpenCode 2 runtime: resolve the installed `opencode` executable, start a private `serve` process on an ephemeral loopback port with a random password, validate the V2 API contract, and connect to it over HTTP.
- Reuse a healthy registered service first; start the managed runtime only when discovery reports absence or a stale registration. Malformed, unhealthy, or incompatible registrations are never silently replaced.
- Activate the existing executable-path setting and add a **Start OpenCode automatically** toggle (default on).
- Own the runtime lifecycle: lazy start on chat open, keep running while the plugin is enabled, stop the process tree on unload, bounded restart on crash, and reaping a recorded orphan on the next start.
- Never write the shared service registration, never stop or replace a shared service, and never launch an OpenCode 1.x binary.

## Capabilities

### New Capabilities

- `managed-opencode-runtime`: owning the lifecycle of a plugin-started private OpenCode 2 process and connecting to it over HTTP (executable resolution and validation, private endpoint, startup policy, lifecycle and cleanup, error handling).

### Modified Capabilities

- `local-opencode-connection`: the discovery requirement now permits starting a managed private runtime when no healthy service is registered, and the executable-path setting becomes active rather than future-only.

## Impact

- `src/opencode/connection.ts` (`ConnectionCoordinator`): route discovery through a resolver that falls back to the managed runtime, and dispose the runtime.
- New `src/opencode/` module for executable resolution, private server spawn, health/version validation, and lifecycle.
- `src/settings.ts`: active `OpenCode 2 executable path` plus `Start OpenCode automatically`.
- `src/main.ts`: wire the runtime and register cleanup.
- `src/ui/chat-view.ts` / renderer: surface managed-vs-shared status, starting/running/failed states, and the explicit start action.
- Tests for resolver, spawn arguments/environment, port/password handling, lifecycle, and error mapping; README and setup docs updated for OpenCode 2.
