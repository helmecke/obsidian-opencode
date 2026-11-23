# Changelog

## Unreleased

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
