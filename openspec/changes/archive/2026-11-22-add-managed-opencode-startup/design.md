# Design

## Context

The plugin connects through `ConnectionCoordinator`, which delegates to `discoverConnection` in `src/opencode/discovery.ts`: read the shared registration, parse and validate it, probe `/api/info`, verify PID/version identity, then wrap the client with `withApiValidation`. There is no launch path.

Two facts shape the approach:

- The OpenCode 2 CLI is a standalone native binary, so spawning it does **not** depend on Obsidian's Electron `RunAsNode` fuse (unlike OpenChamber, which reuses its own Electron binary as Node). Prior art (`mtymek/opencode-obsidian`, `player-Muteki/co-ober`, `DanielDaniel2201/opencodian`) confirms `child_process.spawn` of the CLI works from an Obsidian plugin.
- Issue #1 deferred auto-start because `opencode serve --service` writes the shared registration and can replace an incumbent. A **private** server (no registration, own port/password) avoids that entirely.

## Goals / Non-Goals

**Goals:**

- Start a private OpenCode 2 `serve` process when discovery finds no healthy service, and connect the existing HTTP client to it.
- Reuse the shared service first; never mutate shared registration or processes.
- Own the lifecycle end to end: lazy start, crash restart, process-tree stop, orphan reaping.

**Non-Goals:**

- No bundled binary (a later change swaps only the resolver).
- No shared `--service` startup, no registration publishing, no incumbent replacement.
- No ACP, no web UI/iframe, no new chat features.

## Decisions

1. **Private server, not a shared service.** Spawn `opencode serve --hostname 127.0.0.1 --port <free>` with a per-run password and a plugin-private `XDG_STATE_HOME`. Rationale: sidesteps issue #1's registration races; reuse remains read-only. Alternative (spawn `serve --service`) rejected for the incumbent-replacement hazard.

2. **Resolve `opencode`, never `opencode2`.** Configured path first, else `opencode` from PATH and common platform locations (mirroring mtymek's resolver). Verify `opencode --version` reports a release in `>=2.2.2 <3.0.0`; reject OpenCode 1.x with a dedicated message. Rationale: the user's v2 binary is `opencode`; on mixed installs the setting is the override. No shell; on Windows require the `.exe`, not the `.cmd` shim.

3. **Ephemeral port via a bind-and-release probe.** Bind `127.0.0.1:0`, close, reuse the port, retry on `EADDRINUSE`. Rationale: avoids a fixed default (mtymek's 14096) that can collide. The server's stdout URL line is not parsed.

4. **Transient basic auth.** Generate a random `base64url` password, set `OPENCODE_SERVER_PASSWORD`, connect with username `opencode`. Never persist or log it. The server only echoes a password when the env var is absent.

5. **`ManagedRuntime` module owns the child.** A new `src/opencode/managed-runtime.ts` exposes `acquire(signal) -> OpenCode` and `dispose()`. `ConnectionCoordinator` gains a `discover` that tries discovery first and falls back to the runtime on `absent` or a dead/stale registration. Discovery errors of any other kind (`registration`, `authentication`, `identity`, `transport`) propagate unchanged and never auto-start.

6. **Health and contract validation reuse.** After spawn, wait for `/api/info` (the existing `server.info`) up to a bounded timeout, verify PID identity, then run the existing `withApiValidation`. The managed endpoint gets the same API/event contract checks as a shared service.

7. **Lifecycle.** Lazy start on chat open; the child keeps running while the plugin is enabled (closing the view does not stop it). On unload, stop the process tree: `taskkill /T /F` on Windows, `detached: true` + process-group kill on POSIX. On unexpected exit, restart within a bounded backoff, then surface an error with retry. Record the child PID (and a start token) in plugin data so a hard-quit orphan is reaped before the next start.

8. **Errors and status.** New `ConnectionError` codes (`executable`, `version`, `startup`, `timeout`) with fixed messages and no secrets. The renderer shows a managed-vs-shared indicator and starting/running/failed states.

## Risks / Trade-offs

- Shared `opencode.db` with another live server → sessions do not live-update across processes and SQLite writes contend. Mitigation: document it; defer an `OPENCODE_DB` isolation setting.
- The CLI may still touch a registration despite the private state home → mitigated by isolating `XDG_STATE_HOME`; acceptance asserts the shared `service.json` is unchanged.
- Orphaned process after an Obsidian hard quit → PID record plus process-tree kill on the next start.
- Installed CLI upgrades past the eligible range → the existing eligibility check reports it; no silent downgrade.
- `.cmd`/shell injection on Windows → require the `.exe` and pass args separately, never through a shell.
- Port race between probe and bind → retry once on `EADDRINUSE`.

## Migration Plan

No data migration. New settings default to `autoStart: true` and an empty executable path (resolved from PATH). Existing users are unaffected until they open chat with no healthy service; the shared-service path is unchanged.

## Open Questions

- Whether a given `opencode serve` build writes a registration in non-service mode, and where — to be observed in acceptance; the private state home already neutralizes it.
- Whether to expose `OPENCODE_DB` isolation as a setting when contention is observed.
