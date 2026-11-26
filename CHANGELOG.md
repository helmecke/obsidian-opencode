# Changelog

## Unreleased

- The plugin is now named **OpenCode Chat** to avoid colliding with an existing
  community plugin called **OpenCode**; the plugin ID and installed folder stay
  `opencode-chat`.
- Managed service state now lives in the user's state directory outside the
  vault, so vault sync and backup never carry it. Orphan cleanup verifies a live
  process's start time before stopping it, so a recycled PID is never killed; an
  unconfirmed stop keeps the record for the next start.
- Keyboard focus rings for the conversation title and the Agent, Model, and
  Thinking controls, reduced-motion support, and native control heights.
- Review the files an assistant changed without leaving chat. A turn that
  reports changes ends with a collapsed **Changed files** row naming them;
  expanding it loads the turn's changed files lazily, and each file expands to
  its patch. **Review changes in this conversation…** in the document menu and
  the matching command open a conversation-bounded review listing every changed
  file with its status and counts, expandable per file.
- Patches render as tinted, wrapped unified diffs with **Open** and **Copy
  patch** actions. Large patches stop at a display cap behind **Show full
  patch**, a patch the service marks partial says so, binary and empty patches
  show a note, and deleted or outside-vault files cannot be opened. Patches stay
  in memory only, and a failed load shows a local **Retry** without affecting
  chat, execution, permissions, or the connection.
- Hovering a message or the message field no longer shows a tooltip repeating
  the speaker name or **Message OpenCode**. The names stay available to screen
  readers, and links and controls inside a message keep their own tooltips.

## 1.1.0 (2026-11-25)

- A delegated subagent's report now links to the session that produced it: the
  embed's top-right link opens the child session read-only in the chat view,
  where its prompt reads **Delegated task** and one centered muted line points
  back to the parent. The **opencode / sessions / parent** breadcrumb returns to the
  parent, the switcher keeps listing top-level conversations only, and an
  unresolvable child shows a notice without replacing the parent transcript.
- **Switch conversation…** now lists only the vault's top-level conversations:
  a session that a delegated subagent ran in no longer appears in the switcher,
  while the subagent's report stays in the transcript where it happened.
- Delegated subagent reports now appear where they occurred as a native Markdown
  embed titled with the agent and task description, instead of a collapsed
  **Synthetic note**. The report keeps its Markdown and links, a cancelled result
  says so in the title, and other injected text stays collapsed.
- Answers now read with the theme's own reading typography: text size, line
  height, paragraph spacing, note margins, and reading width come from the
  theme's reading view, so a theme or snippet that changes how notes read
  changes the chat too. Paragraphs in an answer are no longer butt-joined, a run
  of tool or reasoning rows stays one tight block, and the chat view stops
  repainting the pane's text colour and background.
- Your message is now a **You** callout instead of a quotation: a titled block
  with a leading icon and the theme's callout tint, separated from what follows
  by the same spacing as the rest of the transcript. Line breaks are preserved.
- Vault links in chat answers now follow Obsidian's mouse modifiers: a plain
  click reuses a note tab, Cmd/Ctrl-click opens a new tab beside the chat,
  Cmd/Ctrl+Alt-click collects notes in a sticky group to the right of the chat,
  and Cmd/Ctrl+Alt+Shift-click opens a new window. Unresolved links still only
  show a notice and never create files.
- Reasoning is hidden by default. Enable **Settings → OpenCode → Show
  reasoning** to show it as a folded row with a one-line preview that expands to
  the full Markdown; the change applies to an open chat immediately.
- Present the chat transcript like a note: prompts are quoted asides in one
  reading column that follows Obsidian's **Readable line length** setting and
  the theme's note width, the composer card lines up with that measure, and
  answers read as continuous native Markdown. A faint line closes each
  assistant turn with its model, agent, and duration. Reasoning and tool
  activity fold into compact rows with a leading icon and a one-line preview,
  while shell commands, compaction, and injected text collapse behind short
  labels. Routine success or selection notices no longer interrupt the
  document. Failed or interrupted execution stays visible with its error detail.
- Make conversations first-class documents: opening chat starts a client-side
  **New conversation** draft and the OpenCode session is created with the first
  message. The pane header, tab, and native `opencode / sessions / title`
  breadcrumbs show and rename the title, the document menu offers **Switch
  conversation…**, **New conversation**, and **Rename conversation…**, and a
  fuzzy switcher resumes prior conversations. Draft agent, model, and thinking
  use configured defaults, remember the last selected model, and apply to the
  created session.

## 1.0.0 (2026-11-23)

- Initial release: native OpenCode chat in Obsidian with a shared or managed
  local service, streamed Markdown answers, vault link navigation, tool
  activity, permission decisions, agent forms, and conversation recovery.
- Reuse Obsidian's native icon buttons, form controls, settings rows, warning
  callouts, and markdown presentation so the chat follows the active theme and
  accessibility updates more closely.
- Add composer note linking: type `[[` to complete vault Markdown notes, with
  automatic bracket pairing and unambiguous `[[Note]]` or `[[folder/Note]]`
  insertion. References remain plain prompt text.
- Add composer skill mentions: type `$` to complete OpenCode skills by name,
  insert `$skill-name `, and attach each mentioned skill to the sent prompt by
  ID. The catalog loads lazily on first use, and unknown mentions stay plain
  text.
- Add composer slash commands: type `/` to complete OpenCode commands by name
  and insert `/name `. A message whose leading command is known runs it with
  the remaining text as arguments instead of sending it as a prompt; unknown
  names still send as ordinary prompts. The catalog loads lazily on the first
  `/`, and a failed command keeps its text in the composer. Argument
  completion and command management are not included.
