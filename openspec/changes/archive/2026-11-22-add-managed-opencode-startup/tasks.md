# Tasks

## 1. Settings and executable resolution

- [x] 1.1 Add `autoStart` to `OpenCodeSettings` with a default of `true` and extend `loadSettings` to parse it; verify the existing settings tests still pass and add a test for the new field default and persistence
- [x] 1.2 Implement an executable resolver (configured path first, then `opencode` from PATH and common platform locations, `.exe` on Windows, no shell); verify with unit tests covering a path with spaces, a missing executable, and PATH resolution
- [x] 1.3 Implement OpenCode 2 version validation (run `<exe> --version`, parse `opencode vX.Y.Z`, require `>=2.2.2 <3.0.0`, reject 1.x and malformed output); verify with unit tests over version strings and a stub executable
- [x] 1.4 Update the settings tab to an active **OpenCode 2 executable path** plus the **Start OpenCode automatically** toggle, keeping NUL/linebreak rejection; verify the settings tests and `npm run build` pass

## 2. Managed runtime process

- [x] 2.1 Add `src/opencode/managed-runtime.ts` with a spawn routine (`serve --hostname 127.0.0.1 --port <n>`, `OPENCODE_SERVER_PASSWORD`, plugin-private `XDG_STATE_HOME`, `windowsHide`, piped stdio, args passed separately); verify a unit test asserts the spawn options and environment and that no shell is used
- [x] 2.2 Implement ephemeral port selection by binding `127.0.0.1:0` and retrying once on `EADDRINUSE`; verify with a unit test that the port is loopback and released before use
- [x] 2.3 Implement health/identity readiness (poll `/api/info`, verify PID, run the existing `withApiValidation`) with a bounded timeout; verify with a stub HTTP server and a unit test
- [x] 2.4 Implement lifecycle ownership: lazy `acquire`, `dispose` with process-tree kill (`taskkill /T /F` on Windows, process-group kill on POSIX); verify with a fake child process test asserting the tree is stopped and the shared service is untouched

## 3. ConnectionCoordinator integration

- [x] 3.1 Route discovery through the runtime fallback: reuse discovery first, start the managed runtime only on `absent` or a dead/stale registration, and leave `registration`/`authentication`/`identity`/`transport` errors unchanged; verify with coordinator unit tests
- [x] 3.2 Add crash detection with bounded restart backoff and a PID/start-token orphan record that is reaped before the next start; verify with unit tests over the state machine
- [x] 3.3 Add fixed `ConnectionError` codes (`executable`, `version`, `startup`, `timeout`) with secret-free messages; verify the messages contain no password and map correctly in tests

## 4. Wiring and UI status

- [x] 4.1 Construct `ManagedRuntime` in `main.ts` and register its disposal so unload stops the tree; verify the plugin-shell test passes
- [x] 4.2 Expose managed-vs-shared status and starting/running/failed states through the synchronization state and renderer; verify with a view test and `npm run build`
- [x] 4.3 Update README and setup docs for OpenCode 2 auto-start, the active executable setting, and the shared-vs-managed behavior; verify the documented commands and settings match the implementation

## 5. Integration and acceptance

- [x] 5.1 Run `npm test`, `npm run build`, and `npm run lint` and confirm all pass
- [x] 5.2 Manually verify in a disposable vault with OpenCode 2 installed: no service starts the managed runtime, a stale registration starts it, a healthy shared service is reused, an incompatible/unhealthy service is not replaced, the shared `service.json` is unchanged, and unloading stops the process tree

## Workflow follow-up

- Archive the change after review, then verify the archived specs and this change's status.
