# OpenCode Chat for Obsidian

A desktop-only Obsidian plugin for native [OpenCode](https://opencode.ai/) chat.
This plugin provides a movable, theme-aware conversation view with
streamed answers, vault link navigation, tool activity, permission decisions,
and structured agent forms. It is not published in the community catalog.

OpenCode does the work and owns the transcript. The plugin reuses a healthy
local OpenCode service when one is registered; when none is, it can start and
own a private OpenCode 2 process. Open **Settings → OpenCode Chat** to enable or
disable **Start OpenCode automatically** (on by default) and to set the
executable path. The plugin never starts a process merely because Obsidian
loads, and it never downloads OpenCode.

## Requirements

| Component | Requirement |
| --- | --- |
| OpenCode | A stable release from `2.2.2` up to (but not including) `3.0.0`, installed separately |
| Obsidian | `1.14.5` or newer, desktop only |
| Platform | Windows is tested; macOS and Linux are untested; mobile is unsupported |

An eligible version must also pass the plugin's API and event contract checks.
Prereleases, versions outside the range, and malformed versions are rejected
with an **Incompatible OpenCode API** error. The exact policy, individually
tested versions, and observations are recorded in
[runtime compatibility](docs/runtime-compatibility.md). Do not downgrade a
shared service to match the plugin.

## Install

### Install OpenCode

OpenCode must be installed separately; this plugin neither downloads nor
installs it. Follow the [official installation guide](https://opencode.ai/docs/)
and choose a stable release in the eligible range above. The bundled client
version does not need to match the service version exactly. Verify the selected
binary with `opencode --version` (or its full executable path).

### Install the plugin

This plugin is not in the community catalog. Build it from source:

1. Clone this repository into a development directory and use a current LTS
   Node.js with npm.
2. From the repository root, run `npm ci` and `npm run build`.
3. Create `.obsidian/plugins/opencode-chat/` in your vault and copy `main.js`,
   `manifest.json`, and `styles.css` from the repository root into it.
4. Reload Obsidian and enable **OpenCode Chat** under
   **Settings → Community plugins**.

Enabling the plugin alone does not contact or start OpenCode. For watch mode,
the test suite, lint, and the disposable-vault workflow, see
[development](docs/development.md).

## Configure

### Automatic startup

**Settings → OpenCode Chat → Start OpenCode automatically** is on by default. When
it is enabled and no healthy service is registered, opening chat validates the
configured executable and starts a private managed service instead of asking you
to launch one first. The process keeps running while the plugin is enabled,
including after you close the chat view; disabling the plugin stops its process
tree. After a crash, the plugin makes a bounded number of restart attempts
before showing an error with **Retry discovery**.

### Executable path

Open **Settings → OpenCode Chat → OpenCode 2 executable path** and enter the full path
to the OpenCode 2 executable, without surrounding quotes or arguments, for
example `C:\Program Files\OpenCode\opencode.exe`. Spaces are preserved as path
data; the field is never run through a shell. NUL characters and line breaks are
rejected. The value is saved in Obsidian plugin data.

The path is an override. When it is empty, the plugin looks for `opencode.exe`
on Windows or `opencode` elsewhere in `PATH` and common install locations such
as `~/.opencode/bin` or `/usr/local/bin`. On Windows only a native `.exe` is
accepted; the `.cmd` shim is rejected. Before launching, the plugin runs
`opencode --version` and accepts only an eligible version. An OpenCode 1.x
executable is rejected with a fixed error and is never launched.

There is no server-URL, service-password, or provider-key setting. Automatic
startup never writes the shared service registration.

### Show reasoning

**Settings → OpenCode Chat → Show reasoning** is off by default. While it is off, the
transcript omits model reasoning entirely: no summary row, icon, preview, or
body, for live and reopened conversations alike. When it is on, reasoning
appears as a collapsed row with a one-line preview that expands to its full
Markdown, in the same way as tool activity. Changes apply to an open chat
immediately, without reloading the plugin or reselecting the conversation. The
setting controls presentation only: OpenCode still produces reasoning, and the
plugin never stores it.

### Attach the active note automatically

**Settings → OpenCode Chat → Attach active note automatically** is off by default.
When it is on, messages sent from the composer include the open Markdown note as
a `file:///` file reference without an extra chip; the typed text is unchanged.
Turning it off returns to attaching the note only through **Attach active note**.
A note that exceeds the service's 20 MiB per-attachment limit is skipped with a
notice, and a note that is already attached is sent once.

## Open the chat

Select **Open chat** in the ribbon or run **OpenCode Chat: Open chat** from the
command palette. The view opens in a main tab; move it to a sidebar as needed.

The plugin lazily reads the standard local registration, then checks the
service version, PID identity, authenticated health response, and required API
contracts before enabling sends and decisions. It accepts literal loopback HTTP
endpoints only and rejects redirects. Credentials are transient and never
written to settings or errors.

When a healthy compatible service is registered, the plugin reuses it and shows
**Connected · Shared service**. When no service is registered, or the
registration points at a process that is gone, the plugin starts a managed
process on an ephemeral loopback port and shows **Connected · Managed service**.
If a discovery attempt fails, select **Retry discovery**.

The managed process uses a fresh random password and a plugin-private state
directory outside the vault. An incompatible shared service is left untouched: the plugin does
not restart, replace, or reconfigure it. See
[architecture](docs/architecture.md) for discovery, ownership, and lifecycle
details.

## Use the chat

### Conversations

- Opening chat with no chat view open starts a new conversation draft for this
  vault's absolute filesystem path. No OpenCode session exists yet, so opening
  chat does not leave empty sessions behind. When a chat view is already open,
  the command reveals it without starting another conversation.
- The OpenCode session is created with the first message sent from the draft.
  If the draft was renamed first, that local title is applied to the created
  session. Until then, the pane header and tab show **New conversation**.
- A draft's **Agent**, **Model**, and **Thinking** controls start at the
  server's configured defaults and stay editable; the choices are applied when
  the first message creates the session. If the default agent has no model, the
  draft reuses the model you last selected.
- The pane header and the workspace tab show the current conversation's title.
  A conversation without a title shows **New conversation**. Selecting the
  header title edits it in place; Enter or leaving the field commits, Escape
  cancels, and an empty title is ignored. A failed rename shows a notice and
  keeps the previous title.
- The document **⋯** menu and the tab's right-click menu offer **Switch
  conversation…**, **New conversation**, and **Rename conversation…**.
  **Switch conversation…** opens a fuzzy quick switcher over this vault's
  conversations, refreshed each time it opens, newest updated first, with the
  current conversation marked. Choosing a conversation loads its authoritative
  messages. Cancelling leaves the current conversation selected.
- The plugin does not restore a previously selected conversation on its own;
  reopen a prior conversation through the switcher. If the selected conversation
  no longer exists or was moved to another workspace, chat shows a recoverable
  empty state and offers **Switch conversation…** or **New conversation**. It
  does not silently select a different vault's conversation.
- Switching conversations while one is executing continues that execution in
  the background. Switching or creating a conversation with unsent composer
  text or attachments asks before discarding them.

### Composing messages

- The composer is one card. Next to **Retry discovery**, a paperclip
  **Attach selection or active note** icon opens a native menu that lists
  **Attach selection** and **Attach active note** only while their source is
  available, with a hint when neither is. Each attached item appears as a
  removable chip above the message field. The message field sits above a bottom
  toolbar shared by the status and message controls. The card follows the
  transcript's reading column while **Readable line length** is enabled and
  uses the pane width when it is off. The toolbar's left side holds the
  connection and execution status and the **Retry discovery** icon; the
  **Agent** and **Model** selectors and the round arrow-up **Send** button
  follow on the right. Conversation controls live in the document menu, not the
  composer.
  A healthy connection collapses to one small icon whose tooltip carries the
  service mode and execution state; transitions and errors keep their text.
  The view has no separate header. Icon buttons show their name in a tooltip. The
  toolbar wraps in a narrow sidebar so every control and the status stay
  reachable without horizontal scrolling.
- Type in the message field; **Ctrl/Cmd+Enter** sends and **Shift+Enter** inserts
  a newline. The **Send** button is an alternative. The field grows with the
  message up to 40% of the window height and then scrolls.
- Type `[[` to search this vault's Markdown notes. The inline list shows each
  note's name and folder; arrow keys move, Enter or Tab inserts, and Escape or
  blur closes it. The composer inserts `[[Note]]` when the name is unique, or
  the vault-relative `[[folder/Note]]` when it is not. The reference stays
  visible prompt text, and sending the message also attaches the referenced
  note as a file reference so the agent reads the note itself. Aliases, headings,
  and block fragments resolve to the note; unresolved references stay text.
  Brackets pair automatically, a typed `]` skips an existing closer, and
  Backspace removes an empty pair. Ctrl/Cmd+Enter still sends while the list is
  open.
- **Attach active note** adds a chip for the Markdown note in the editor, and
  **Attach selection** snapshots the selected text with its source note. Both
  are in the paperclip menu beside **Retry discovery** and appear only while
  their source is available. A selection is sent as labelled message text at
  the moment you attach it; a note is sent as a `file:///` reference and its
  contents are not copied by the plugin. Select a chip's **×** to remove that
  item; the typed message is unchanged. Identical notes attach once, and notes
  larger than 20 MiB are skipped with a notice.
- **Settings → OpenCode Chat → Attach active note automatically** is off by default.
  Enable it to attach the open Markdown note with every message without adding a
  chip; otherwise the active note is attached only when you ask.
- Type `$` at the start of the message or after a space to search the OpenCode
  skills available to this vault. The inline list shows each skill's name and
  description; arrow keys move, Enter or Tab inserts, and Escape or blur closes
  it. The composer inserts `$skill-name ` and leaves the caret after the space.
  Sending a message attaches every mentioned skill by ID while the `$name` text
  stays in the message; duplicate mentions attach a skill once, and unknown
  names stay plain text. The catalog loads on the first `$` and does not block
  composing or sending if it is unavailable. Ctrl/Cmd+Enter still sends while
  the list is open.
- Type `/` at the start of the message to search the OpenCode commands
  available to this vault. The inline list shows each command as invoked
  (`/name`) and its description when one is available; nested names such as
  `/team/review` are supported. Arrow keys move, Enter or Tab inserts, and
  Escape or blur closes it. The composer inserts `/name ` and leaves the caret
  after the space while preserving any text that followed it. Sending a message
  whose first token is a known command runs it with the rest of the text as
  arguments instead of sending it as a prompt; unknown `/name` text is sent as
  an ordinary prompt. Skill mentions in the arguments attach the same way as for
  prompts. The catalog loads on the first `/` without blocking composing or
  sending, and a failed command keeps its text in the composer. Ctrl/Cmd+Enter
  still sends while the list is open.

### Reading the transcript

- The transcript reads as one Markdown note in the active Obsidian theme.
  Prompts and answers share one centered reading column of note width while
  **Readable line length** is enabled, and use the pane width when it is off. A
  narrow sidebar uses the available width without horizontal scrolling.
- Your message appears as its own labelled block titled **You**, with a leading
  icon, the theme's callout tint, and its line breaks preserved, so it stays easy
  to find without a chat bubble. Answers read as continuous native Markdown:
  headings, paragraphs, lists, quotes, code, and tables use Obsidian's reading
  typography, and only turn boundaries add space.
- One faint line after an assistant turn shows the model, agent, and elapsed
  duration when the run provides them. Missing values are omitted, and the line
  stays absent while the answer is still streaming.
- Tool activity folds into a compact single-line row with a leading icon, a
  name, and a one-line preview. A tool row also shows its status or duration.
  When **Show reasoning** is enabled, reasoning uses the same folded row; it is
  hidden by default. Hovering or focusing a row swaps the icon for a chevron that
  points down while the row is open. Expanded details stay plain text, and long
  previews truncate instead of widening the column.
- A delegated subagent's report appears where it occurred as an Obsidian embed,
  titled with the agent and task description and rendered as Markdown with its
  links. A cancelled report says so in the title. The embed's top-right link
  opens the subagent's own session read-only: its task is labelled **Delegated
  task**, the composer shows only a hint naming the parent conversation, and the
  header breadcrumbs return to the parent. The child cannot be renamed or
  written to and stays out of the switcher; a report whose child session no
  longer exists shows a notice and leaves the parent open. Other injected skill
  or system text stays collapsed.
- Shell commands, compaction, and injected skill or system text stay collapsed
  behind a short label and expand on request.
- The transcript stays quiet about routine success and agent, model, or
  location changes; the composer status carries the final execution state.
  Failed or interrupted execution remains visible as a compact line with its
  error detail.

### Reviewing changes

- After an assistant turn that changed files, the transcript shows a collapsed
  **Changed files** row naming them. Expanding it loads that turn's changed
  files; expanding a file shows its patch. Nothing is fetched for a turn until
  you expand it.
- **Review changes in this conversation…** in the document **⋯** menu and
  **OpenCode Chat: Review changes in this conversation** in the command palette open
  a session-wide review. It is bounded to this conversation, from its first
  turn's start to its last turn's end, and refreshes each time it opens.
- Each file row shows its path, status (added, modified, or deleted), and
  added/removed counts. Expanding a file parses its patch into a unified diff:
  additions and removals are tinted, context lines stay muted, and long lines
  wrap instead of scrolling horizontally.
- A large patch stops at a display cap; **Show full patch** reveals the rest. A
  patch the service marks as partial says **Only part of this change is shown.**
  A binary or empty patch shows the file's status and a note instead of a diff.
- Every file offers **Open** and **Copy patch**. A deleted or outside-vault file
  keeps its path but **Open** is disabled. Opening uses the same vault link
  handling as other links and never modifies the file; copying places the patch
  text on the clipboard.
- The review is read-only and lazy. Patches stay in memory for the open chat
  view and are discarded when you switch conversations or close the view; they
  are never written to plugin data, the transcript, or logs. A failed load shows
  a compact error with **Retry** and leaves chat, execution, permissions, and the
  connection unchanged. The diff endpoint is not part of the required
  compatibility contract, so an older service simply has no review surface.

### Running, stopping, and status

- While execution is running, a square **Stop** button replaces the **Send**
  button in the same toolbar position. It requests server-side interruption,
  refreshes the reported state, and gives way to **Send** when execution
  finishes. Closing, moving, or disabling the UI is not a stop action: execution
  continues and reopening chat recovers its current state.
- The **Model** trigger shows the selected model's name, followed by its
  thinking variant when the model exposes variants, and the **Agent** trigger
  shows the agent's name and icon. Both list server-provided options for the
  current location; long names stay available in the selector's tooltip. A
  change is applied on the server and the confirmed selection is refreshed. A
  failed change leaves the previous confirmed selection in place and displays an
  error.
- Submitted text appears immediately, followed by incremental Markdown and the
  final execution state. Connection, synchronization, and execution failures
  appear in the composer status rather than as repeated global notifications.
- **Retry discovery** is the refresh icon in the composer toolbar and is
  available after connection failure or exhaustion. It is disabled while an
  automatic bounded-backoff attempt is running.

### Reconnection and send recovery

On connect or reconnect, the plugin loads authoritative messages, active
execution, pending permissions, and pending forms before enabling normal
interaction. Connection loss shows a retrying state and uses bounded
exponential backoff; after the retry budget is exhausted, use **Retry
discovery**. Recovery never replays a prompt, decision, or execution.

Sending uses a stable prompt identity. If the connection fails before admission
is confirmed, the draft is retained and the message is shown as **Not
confirmed** in the composer card. The plugin reconciles server state before any
retry and reuses the same identity, so an already-admitted message is not
duplicated. Use **Reconcile and retry**, or **Return text to editor** to edit the
retained text.

OpenCode owns the transcript and execution. The plugin stores only the
executable-path setting, the automatic-startup preference, the reasoning-display
preference, the active-note automatic-attachment preference, the last selected
model and variant, and a transient record of a managed process PID and start time
for orphan cleanup; it does not persist the selected conversation, duplicate transcripts,
changed-file patches, or store service credentials.

## Markdown and vault links

Answers render as Obsidian Markdown through `MarkdownRenderer`. Fenced code
blocks and inline code stay literal, including wikilink-looking syntax.
Incomplete streamed Markdown is re-rendered in batches and again when the answer
completes.

Links in answers resolve from a stable vault-root source context. Changing the
active note does not change how an existing answer's links resolve. Composer
context attachment is a separate action and does not change that source context.

- Note names, vault-relative paths, aliases, headings, and block references use
  Obsidian's internal-link resolution.
- An unresolved link or a contextless self-reference such as `[[#Heading]]`
  produces a non-destructive notice. It never creates or modifies a file.
- Hover previews are deferred and not part of this version's navigation
  contract.

Activating a resolved link follows Obsidian's modifier contract without
navigating the chat or closing the conversation:

| Action | Result |
| --- | --- |
| Click | Opens the note in an existing note tab, preferring one outside the chat's tab group; opens a new tab in the chat's tab group when no note tab is available. |
| Cmd/Ctrl+click or middle-click | Opens the note in a new tab in the chat's current tab group. |
| Cmd/Ctrl+Alt+click | Opens the note in the note group beside the chat. |
| Cmd/Ctrl+Alt+Shift+click | Opens the note in a new window. |

The note group is created to the right of the chat the first time you use
Cmd/Ctrl+Alt+click. Later Cmd/Ctrl+Alt-clicks add tabs to that group. A note that
is already open there is focused with its heading or block target applied, not
added twice. If you close the group, the next Cmd/Ctrl+Alt+click creates a new
one. The group belongs to that chat tab and is forgotten when the tab closes or
the plugin reloads. New tabs follow Obsidian's **Always focus new tabs**
preference.

Every row preserves a heading or block target in the link.

The note group opens as ordinary tabs. To stack them, right-click the group's
tab header and choose **Stack notes** once; Obsidian remembers that presentation
for the group. The plugin does not change it for you.

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

## Data and privacy

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
not rewrite those files. It adds no telemetry.

The active note is attached only when you add it in the composer, or when the
off-by-default **Attach active note automatically** setting is enabled.
Attachments are `file:///` references to vault paths; OpenCode reads the file
itself, and the plugin does not copy its contents. The service accepts at most
20 MiB per attachment. An attached selection is sent as message text from the
snapshot taken when you attached it.

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

## Troubleshooting

- **No OpenCode service found**: enable **Start OpenCode automatically**, set
  the executable path, or start OpenCode outside Obsidian, then choose
  **Retry discovery**.
- **Incompatible OpenCode API**: the service is reachable but outside the
  eligible version range or missing a required contract. Use an eligible stable
  release; the plugin never replaces or restarts a shared service.
- **Discovery keeps failing**: use the official
  [V2 troubleshooting guide](https://opencode.ai/v2/docs/troubleshooting). Some
  CLI commands may start or stop a service and are not read-only workarounds.
  Do not edit OpenCode's registration, change CORS, or restart another client's
  service.
- **Plugin does not load after a build**: confirm `main.js` and `manifest.json`
  are at the top level of `.obsidian/plugins/opencode-chat/`.

## Documentation

- [Architecture](docs/architecture.md): modules, discovery, service ownership,
  persistence, and recovery internals.
- [Development](docs/development.md): build, test, lint, and disposable-vault
  install workflow.
- [Runtime compatibility](docs/runtime-compatibility.md): version policy,
  verification evidence, and remaining limitations.
- [Client contract review](docs/client-contract-review.md): required endpoints,
  authentication, prompt identity, permission/form schemas, and events.

Contributor and agent conventions live in [AGENTS.md](AGENTS.md).
