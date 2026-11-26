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
  completion, context attachments, message rendering, Markdown and vault links,
  forms, permission cards, tool entries, and native controls.
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
- the reasoning-display preference;
- the active-note automatic-attachment preference;
- the last selected model and variant;
- a transient managed-process PID and token for orphan cleanup.

The selected session is not persisted. `SessionCoordinator` keeps the selection
or a client-side draft in its in-memory snapshot: opening chat starts a fresh
conversation draft, and connecting or retrying reloads that snapshot's selected
session without creating another. No server session is created until the first
message is sent; the draft's optional local title is passed to
`session.create` at that point. Transcripts, drafts, and service credentials are
never stored. A selected session that is missing or belongs to another workspace
produces a recoverable empty state rather than silently selecting a different
conversation. Resuming a prior conversation is explicit through **Switch
conversation…**. A draft resolves its default agent from `config.default_agent`
(then `build`, then the first primary agent). Its model comes from the agent's
own model, then the configured `model`, then the last model the user selected,
then `model.default`, then the first enabled catalog model. Those selections are
shown and can be changed in the draft, and are passed to `session.create`.

## Composer context attachment

`src/ui/composer-attachments.ts` owns the per-message attachment shape: a note
item carries a `TFile`, and a selection item carries snapshot text plus its
source path. `ChatComposer` keeps that list and renders one removable chip per
item above the field. `ChatRenderer` shows a paperclip menu beside **Retry
discovery** with **Attach selection** and **Attach active note**, offering each
item only while its source exists. `ChatView` tracks the active Markdown editor,
resolves `[[...]]` references at send time with
`MetadataCache.getFirstLinkpathDest` after stripping alias, heading, and block
fragments, adds the optional auto-attached note, and collapses duplicates by
vault path.

`SynchronizationActions.sendMessage` prepends each selection as a labelled text
block, converts notes to `SessionPromptInput.files` entries with `file:///` URIs
built from the vault root, and keeps the typed text unchanged.
`PromptCoordinator` stores that `files` list on `PendingPrompt` and sends it with
the stable `msg_` identity, so reconciliation and retry reuse the same
attachments. The plugin never reads a note: only the selected text range is
read, and a file is skipped from `TFile.stat.size` with a notice when it exceeds
the service's 20 MiB per-attachment limit.

## Chrome

The pane header title and workspace tab mirror `ChatView.getDisplayText()`,
which returns the selected session's title or **New conversation**. Obsidian has
no public API to refresh a view title after open, so `ChatView` feature-detects
the native `.view-header-title` node and the leaf's tab-title element and writes
the text directly. The header hook also offers click-to-inline-rename; when the
node or leaf element is absent the view degrades to the document menu's
**Rename conversation…** action. A `session.renamed` event patches the snapshot
and republishes, so external renames update the chrome without reloading the
transcript. `session.deleted` marks the selection unavailable.

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
