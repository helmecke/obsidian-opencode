# Architecture

How the plugin connects to OpenCode, what it owns, and what it persists. The
user-facing behavior is described in the [README](../README.md); verification
evidence is in [runtime compatibility](runtime-compatibility.md).

## Runtime shape

The plugin runs inside Obsidian's Electron renderer and talks over loopback HTTP
to a local OpenCode service. `@opencode/client` `2.2.2` is bundled; the service is
installed separately.

- `src/main.ts` wires lifecycle only: settings, managed runtime, connection,
  sessions, synchronization, the chat view, the ribbon icon, and the
  `open-chat` command.
- `src/opencode/` handles discovery, compatibility, transport, sessions,
  executable resolution, and the managed process.
- `src/state/` handles live event ingestion, the session reducer, prompt
  identity and reconciliation, interactions, and the synchronization state
  machine.
- `src/ui/` holds the chat view, composer and its `[[`, `$`, and `/`
  completion, message rendering, Markdown and vault links, forms, permission
  cards, tool entries, and native controls.
- `styles.css` documents the Obsidian surfaces the chat reuses.

## Discovery and connection

Discovery is lazy and shared by all views. It reads the standard local
registration (bounded to 16 KiB), then validates before enabling sends and
decisions:

- the version is eligible and the required API and event contracts are present;
- the PID matches a live process;
- the authenticated health response succeeds;
- the endpoint is a literal loopback HTTP origin and redirects are rejected.

Credentials come from the registration and are transient. They are never
written to settings or included in errors.

If discovery reports a healthy service, it is reused as **Connected · Shared
service**. If it reports no registration (`absent`) or a registration whose
process is gone (`stale`), and automatic startup is enabled, a managed service
starts. Registration, authentication, identity, and transport failures never
launch a process.

Synchronization subscribes to live events, buffers them, and loads authoritative
messages, active execution, pending permissions, and pending forms before
allowing normal interaction. If buffered events overlap the snapshot or the
queue overflows, the partial live projection is discarded and the snapshot is
reloaded. Connection loss uses bounded exponential backoff; after exhaustion,
only **Retry discovery** starts another attempt.

## Managed service lifecycle

The managed runtime resolves the executable, runs `opencode --version`, and
accepts only a stable eligible version. It selects a free port on `127.0.0.1`
and spawns:

```text
opencode serve --hostname 127.0.0.1 --port <ephemeral>
```

The process gets a fresh random password and a plugin-private
`XDG_STATE_HOME`, so it never uses or writes the shared registration. Readiness
polls `/api/info` and requires the spawned PID. A recorded orphan PID from an
earlier run is stopped before a new managed process starts. Crashes restart with
bounded backoff and end in a fixed, password-free failure. Disabling the plugin
kills the managed process tree and clears the orphan record.

## Persistence

Plugin data holds only:

- the executable-path override;
- the automatic-startup preference;
- the selected session ID and its vault directory;
- a transient managed-process PID and token for orphan cleanup.

Transcripts, drafts, and service credentials are never stored. Reopening chat
reloads authoritative messages from OpenCode. A saved session that is missing or
belongs to another workspace produces a recoverable empty state rather than
silently selecting a different conversation.

Prompts use a stable `msg_` identity. If the connection fails before admission
is confirmed, the draft stays in the composer as **Not confirmed**.
Reconciliation checks authoritative messages before retry and reuses the same
identity, so an admitted message is never sent twice. Recovery never replays a
prompt, decision, or execution.

## Service ownership

A healthy shared service owns its process, registration, configuration, and
execution state; the plugin is only a client. It reads the registration without
modifying it and never stops, restarts, replaces, or reconfigures that service.
Do not delete or edit the registration, private service configuration, or
database to fix discovery, and do not change CORS or authentication to work
around a connection error. Coordinate lifecycle changes with other connected
clients.

A managed service is private to the plugin: its own loopback port, password,
state directory, and process tree. Closing the view releases UI resources
without interrupting execution; disabling the plugin aborts plugin-owned
requests, subscriptions, retries, and timers without touching a shared service.

## Compatibility gate

Version eligibility and contract compatibility are separate. A stable release in
`>=2.2.2 <3.0.0` with valid SemVer build metadata is eligible, but it must also
satisfy the required API and event contracts used by the plugin. Incompatible
endpoints or payloads produce a fixed **Incompatible OpenCode API** error, keep
sends and decisions disabled, and leave the service untouched. The policy lives
in `src/opencode/compatibility.ts`; the contract evidence is in
[client contract review](client-contract-review.md).

## Constraints

- Desktop only; the manifest sets `isDesktopOnly: true`.
- The vault is a working directory, not a security sandbox. OpenCode can reach
  outside it according to its configuration, permissions, and host-user
  authority.
- The plugin adds no telemetry and does not attach the active editor's contents
  automatically.
