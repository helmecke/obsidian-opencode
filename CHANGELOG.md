# Changelog

## Unreleased

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
