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

## Electron verification

Node success alone does **not** establish Electron compatibility. The runtime
probes below test the approved vault directly. A production supported-version
policy and non-destructive startup behavior remain work for task 1.3 and later.

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
  `app://obsidian.md`. A subsequent diagnostic captured the message
  `Failed to fetch`; this alone does not establish CORS as the cause.
  No credentials or registration contents were printed.
- Therefore renderer fetch is **not a validated transport** in this runtime.
  The Node transport probe below is the successful alternative.
- No service ensure/start/stop operation, conversation creation, model request,
  service-registration write, global fetch override, or CORS change was made.

### Successful in-process Node transport

Bundled `scripts/node-transport-probe.mjs` to
`.obsidian/node-transport-probe.cjs` in the approved vault and invoked `run()`
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
startup and production discovery still require a design decision and tests.

The pinned service helper uses the renderer's global `fetch` internally and
does not accept the custom `fetch` option exposed by `OpenCode.make`. A Node
HTTP transport for client requests alone does not fix that helper. Pause for
design review before choosing an isolated Node context for service management
or a narrow local discovery adapter. Do not silently patch the dependency,
globally replace fetch, or switch to SDK hosting.

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
