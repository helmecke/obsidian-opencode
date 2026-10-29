# Runtime compatibility gate

## Automated verification

Task 1.1 verified on Windows with Node.js 26.13.0 and pinned
`@opencode/client` 2.2.2:

- `npm install --save-exact @opencode/client@2.2.2` succeeded.
- `npm test` imports both the Promise client and local service entrypoint
  without discovering or starting a service.
- The suite bundles both entrypoints as ES2021 CommonJS, checks the esbuild
  dependency graph for unbundled packages, and executes the bundle in Node.
  Only native Node modules remain external. Client construction performs no
  requests; authentication and event streaming are not yet tested.
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

## Pending Electron verification

Node success does **not** establish compatibility with Obsidian's Electron
runtime. No Obsidian version or supported OpenCode runtime range has been
verified yet. No service was started or stopped by these checks.

The user approved the disposable Windows vault path
`C:\Users\Jakob\AppData\Local\Temp\opencode\obsidian-test-vault`.
The installed OpenCode executable reports `opencode v2.2.2`.

### Electron probe results

The approved vault is open and the CLI is working. Observed versions:

| Component | Version |
| --- | --- |
| Obsidian / installer | 1.14.5 / 1.14.5 |
| Electron | 43.8.3 |
| Embedded Node | 24.22.0 |
| Chromium | 150.0.7871.250 |
| Installed OpenCode / pinned client | 2.2.2 / 2.2.2 |

Bundled `scripts/runtime-probe.mjs` as ES2021 CommonJS with Node built-ins
external, placed the output at `.obsidian/runtime-probe.cjs` in the approved
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
  `app://obsidian.md`. No credentials or registration contents were printed.
- Therefore renderer fetch is **not a validated transport** in this runtime.
  Authenticated requests and streaming have not passed the Electron gate.
  Task 1.2 remains incomplete; no supported runtime range is claimed.
- No service ensure/start/stop operation, conversation creation, model request,
  service-registration write, global fetch override, or CORS change was made.

The pinned service helper uses the renderer's global `fetch` internally and
does not accept the custom `fetch` option exposed by `OpenCode.make`. A Node
HTTP transport for client requests alone would not fix discovery. Pause for
design review before choosing an isolated Node context for service management
or a narrow local discovery adapter. Do not silently patch the dependency,
globally replace fetch, or switch to SDK hosting.

When rerunning the probe through `require`, evict its exact entry from
`require.cache` after rebuilding so Electron does not reuse the previous bundle.

After agreeing on the service-discovery approach, verify authenticated requests
and event streaming in Electron and record the final transport here.
Do not alter shared-service registration,
restart an incompatible service, weaken authentication, or change global CORS
configuration. If the documented client approach fails, pause for design
revision before building the full UI.
