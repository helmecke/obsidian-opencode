# OpenCode for Obsidian

A desktop-only Obsidian plugin for native [OpenCode](https://opencode.ai/) chat.
This development build provides a movable, theme-aware conversation view with
streamed answers, vault link navigation, tool activity, permission decisions,
and structured agent forms. It is not published in the community catalog.

**A healthy OpenCode service is reused first.** When none is registered, the
plugin can start and own a private OpenCode 2 process instead of requiring you
to launch one first. Open **Settings → OpenCode** to enable or disable
**Start OpenCode automatically** (on by default) and to set the executable path.
The plugin never starts a process merely because Obsidian loads, and it never
downloads OpenCode.

## Supported and tested versions

| Component | Current policy / evidence |
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
OS-level mid-stream socket drop; stream-end recovery is covered by
deterministic tests. The
[client contract review](docs/client-contract-review.md) is source evidence,
not a live acceptance result or identification of your installed OpenChamber.

An incompatible shared service is left untouched: the plugin does not restart,
replace, or reconfigure it. Do not downgrade a shared service just to match the
plugin; coordinate lifecycle changes with other connected clients.

The earlier disposable-vault transport experiment verified authenticated API
access and a live `server.connected` event using in-process Node HTTP with a Web
stream bridge; renderer `fetch` failed in that runtime. The 2026-11-22
acceptance run used the installed production plugin; details and remaining
limitations are in [runtime verification](docs/runtime-compatibility.md).
Older Obsidian versions, macOS, Linux, and mobile have no claimed test coverage;
mobile is unsupported.

## Installation and build setup (development only)

### Separate OpenCode installation

OpenCode must be installed separately; this plugin neither downloads nor
installs it. Follow the [official installation guide](https://opencode.ai/docs/)
and choose a stable release in the eligible range above. The bundled client
version does not need to match the service version exactly.
Verify the selected binary with `opencode --version` (or its full executable
path).

### Build and install in a disposable vault

1. Clone this repository into a development directory. Use a current LTS Node.js
   and npm for the build; this is separate from Obsidian's embedded Node runtime.
2. From the repository root:

   ```sh
   npm ci
   npm test
   npm run build
   npm run lint
   ```

3. In a disposable desktop test vault, create `.obsidian/plugins/opencode-chat/`.
   Copy `main.js`, `manifest.json`, and `styles.css` from the repository root
   into that directory. Do not copy `node_modules` or install into a real vault
   as part of this development check.
4. Reload Obsidian and enable **OpenCode** under **Settings → Community plugins**.
   Enabling the plugin alone does not contact or start OpenCode.

`npm run dev` watches and rebuilds during development; copy rebuilt artifacts
and reload the plugin to test changes. Do not commit generated `main.js` or
`node_modules`.

## Executable-path configuration

Open **Settings → OpenCode → OpenCode 2 executable path**. Enter the full path
to the OpenCode 2 executable, without surrounding quotes or arguments, for
example `C:\Tools\OpenCode 2.2.2\opencode.exe`. Spaces are preserved as path
data; the field is never run through a shell. NUL characters and line breaks
are rejected. The value is saved in Obsidian plugin data.

The path is an override. When it is empty, the plugin looks for `opencode.exe`
on Windows or `opencode` elsewhere in `PATH` and common install locations such
as `~/.opencode/bin` or `/usr/local/bin`. On Windows only a native `.exe` is
accepted; the `.cmd` shim is rejected. Before launching, the plugin runs
`opencode --version` and accepts only a stable release in `>=2.2.2 <3.0.0`.
An OpenCode 1.x executable is rejected with a fixed error and is never launched.

There is no server-URL, service-password, or provider-key setting. Automatic
startup never writes the shared service registration.

## Start OpenCode and open chat

Automatic startup is controlled by **Settings → OpenCode → Start OpenCode
automatically** (default on). With it enabled:

1. Select the **OpenCode** ribbon action or run **OpenCode: Open chat** from the
   command palette. The view opens in a main tab; move it to a sidebar as needed.
2. The plugin lazily reads the standard local registration and checks the
   service version, PID identity, authenticated health response, and required API
   contracts before enabling sends and decisions. It accepts literal loopback
   HTTP endpoints only and rejects redirects. Credentials are transient and never
   written to settings or errors.
3. When a healthy compatible service is registered, the plugin reuses it and
   shows **Connected · Shared service**. When no service is registered or the
   registration points at a process that is gone, the plugin resolves the
   configured executable, validates its version, starts a private `serve` process
   on an ephemeral loopback port, and shows **Connected · Managed service**.
4. After a failed attempt, select **Retry discovery**. Absence explains how to
   enable automatic startup or start OpenCode outside Obsidian; malformed,
   unreachable, unauthenticated, incompatible, or changed shared registrations
   show fixed errors and never permission to replace the service.

The managed process keeps running while the plugin is enabled, including after
you close the chat view. Disabling the plugin stops the process tree. After a
crash, the plugin makes a bounded number of restart attempts before showing an
error with **Retry discovery**. The private server uses a fresh random password,
a plugin-private state directory, and never writes or changes the shared
`service.json`.

Do not edit OpenCode's registration, change CORS, or restart another client's
service to work around discovery errors. Use the official
[V2 troubleshooting guide](https://opencode.ai/v2/docs/troubleshooting) for
diagnostics; note that some CLI commands may start or stop a service and are not
read-only workarounds.

## Use the chat

### Conversations

- **New conversation** creates a session whose workspace is this vault's
  absolute filesystem path. Creation is deduplicated when clicked repeatedly.
  The icon button sits in the composer's bottom toolbar, next to the
  **Conversation** selector; its name appears in a tooltip.
- The **Conversation** list shows sessions belonging to this vault only. Choose
  one to resume it. The last selected session is remembered. The selector is in
  the composer's bottom toolbar and has no visible label; its name appears in a
  tooltip.
- Reopening chat reloads the selected conversation's authoritative messages from
  OpenCode without creating a duplicate. If the saved conversation no longer
  exists or was moved to another workspace, chat shows a recoverable empty state
  and offers conversation selection or creation. It does not silently select a
  different vault's conversation.

### Messages and execution

- The composer is one card. The message field sits above a bottom toolbar shared
  by the conversation and message controls. The toolbar's left side holds the
  connection and execution status, the **Conversation** selector, the
  **New conversation** icon, and the **Retry discovery** icon; the **Agent** and
  **Model** selectors and the round arrow-up **Send** button follow on the right.
  The view has no separate header. Icon buttons show their name in a tooltip. The
  toolbar wraps in a narrow sidebar so every control and the status stay
  reachable without horizontal scrolling.
- Type in the message field; **Ctrl/Cmd+Enter** sends and **Shift+Enter** inserts
  a newline. The **Send** button is an alternative. The field grows with the
  message up to 40% of the window height and then scrolls.
- While execution is running, the composer's toolbar also shows a square
  **Stop** button. It requests server-side interruption, refreshes the reported
  state, and disappears when execution finishes. Closing, moving, or disabling
  the UI is not a stop action: execution continues and reopening chat recovers
  its current state.
- The **Agent** and **Model** selectors are compact pills in the composer's
  toolbar. They list server-provided options for the current location; a
  long selected model name is available in the selector's tooltip. A change is
  applied on the server and the confirmed selection is refreshed. A failed
  change leaves the previous confirmed selection in place and displays an
  error.
- Submitted text appears immediately, followed by incremental Markdown and the
  final execution state. Connection, synchronization, and execution failures
  appear in the composer status rather than as repeated global notifications.
- **Retry discovery** is the refresh icon in the composer toolbar and is
  available after connection failure or exhaustion. It is disabled while an
  automatic bounded-backoff attempt is running.

### Conversation persistence and connection recovery

OpenCode owns the transcript and execution. The plugin stores only the
executable-path setting, the automatic-startup preference, the selected session
ID plus its vault directory, and a transient record of a managed process PID for
orphan cleanup; it does not duplicate transcripts or store service credentials.
Reopening always uses OpenCode's messages as the source of truth.

On connect or reconnect, the plugin subscribes to live events, buffers relevant
ones, and loads authoritative messages, active execution, pending permissions,
and pending forms before enabling normal interaction. If events overlap the
snapshot or a queue overflows, the partial live projection is discarded and the
snapshot reloaded instead of guessing. Connection loss shows a retrying state,
uses bounded exponential backoff, and requires **Retry discovery** after the
retry budget is exhausted. Recovery never replays a prompt, decision, or
execution.

Sending uses a stable prompt identity. If the connection fails before admission
is confirmed, the draft is retained and the message is shown as **Not
confirmed** in the composer card. The plugin reconciles server state before any
retry and reuses the same identity, so an already-admitted message is not
duplicated. Use **Reconcile and retry**, or **Return text to editor** to edit the
retained text.

## Markdown and vault links

Answers render as Obsidian Markdown through `MarkdownRenderer`. Fenced code
blocks and inline code stay literal, including wikilink-looking syntax.
Incomplete streamed Markdown is re-rendered in batches and again when the answer
completes.

Links in answers resolve from a stable vault-root source context. Changing the
active note does not change how an existing answer's links resolve. The first
version does not attach the active editor as a source note.

- Note names, vault-relative paths, aliases, headings, and block references use
  Obsidian's internal-link resolution.
- Activating a resolved link opens it in a separate leaf, leaving the chat
  conversation available.
- An unresolved link or a contextless self-reference such as `[[#Heading]]`
  produces a non-destructive notice. It never creates or modifies a file.
- Hover previews are deferred and not part of this version's navigation
  contract.

## Tool activity, permissions, and forms

Tool calls appear as compact, collapsed entries that can be expanded to inspect
their input, progress, result, or failure. Running, successful, and failed calls
are distinguished. Tool output is shown as text, never interpreted as executable
HTML or scripts. Truncated details are labelled.

Pending permission requests display the action, resources, any message, and the
server-provided persistent-save scope. Decisions are explicit:

- **Allow once** submits a one-time decision.
- **Always allow** is available only when the server supplied a persistent scope;
  the scope to be saved is shown before submission.
- **Reject** submits rejection.

The plugin never grants a request automatically and does not edit OpenCode's
permission configuration. A reply button remains disabled while its decision is
being submitted. If the reply fails or the request was already settled elsewhere,
the current server state is refreshed, stale controls are removed, and an error
is shown instead of a false success.

Agent forms render the pinned schema's text, choice, multiselect, numeric,
integer, boolean, and external-link fields. Required fields, visibility
conditions, and validation are enforced before submission. You can cancel a
form at any time. External links open only on explicit click and only for
`http`/`https` URLs. A field type unknown to this plugin produces a visible
compatibility error and blocks submission rather than sending a partial answer.
Form answers and permission controls are reconciled after reconnect or another
client's reply.

## Data flow and permissions

The plugin talks to a local OpenCode service; **local service access does not
mean model processing is offline**. Explicit chat requests can cause OpenCode to
read or modify files and send prompts, file contents, filenames, and tool results
to configured model or tool providers, including remote MCP services. Provider
retention, privacy terms, and charges depend on the services you configure.
Review them before supplying sensitive data.

Provider accounts and models are managed in OpenCode, not in Obsidian plugin
settings. Consult the official [V2 providers guide](https://opencode.ai/v2/docs/providers)
and [configuration guide](https://opencode.ai/v2/docs/config). Global and
discovered project/ancestor configuration can affect behavior; the plugin does
not rewrite those files. It adds no telemetry and does not automatically attach
the active editor's contents.

The vault workspace is a working directory, **not a security sandbox**. OpenCode
can access locations outside the vault according to its configuration,
permissions, and host-user authority. Shell tools can use the host filesystem,
processes, and network; do not assume every risky action or external path will
prompt. Review OpenCode's [V2 permissions guide](https://opencode.ai/v2/docs/permissions)
and your effective rules before allowing agent work.

Service authentication is discovered transiently and is not saved in plugin
settings or exposed in plugin error messages. Do not paste service credentials
or provider keys into the executable-path field, logs, or bug reports. Local
discovery relies on the normal OS-user trust boundary; it does not protect
against a malicious process running as the same user.

## Shared-service and managed-service ownership

A healthy shared OpenCode service owns its process and execution state; the
plugin is only a client. It reads the shared registration without modifying it
and never stops, restarts, or replaces that service. Closing the view releases
its UI resources without interrupting execution.

A service started by the plugin is private: its own loopback port, password,
state directory, and process tree. The plugin starts it lazily when chat opens
with no healthy shared service, keeps it running while the plugin is enabled, and
stops its process tree on unload. It never writes the shared registration, and a
recorded PID from an earlier run is stopped before a new managed process starts.
Disabling the plugin aborts plugin-owned requests, subscriptions, retries, and
timers without stopping a shared service or interrupting another client's work.

Do not delete or edit OpenCode's service registration, private service
configuration, or database to fix plugin discovery. Coordinate service lifecycle
changes with other connected clients outside this plugin.

## Verification status

`npm test` covers connection/discovery safety, executable resolution and version
validation, managed spawn arguments and environment, ephemeral ports, readiness,
lifecycle/orphan handling, shared-versus-managed fallback, session scoping and
persistence, event reduction, synchronization and recovery, prompt identity, link
routing and Markdown batching, form validation, permission payloads, tool entries,
and the native view controls. `npm run build` and `npm run lint` are the other
required checks. These automated checks do not replace the manual Obsidian
acceptance checks listed in [runtime verification](docs/runtime-compatibility.md);
that document records what has and has not been observed.
