# Proposal

## Why

The transcript still reads as a stack of chat cards: role labels repeat, assistant text is framed, and supporting detail appears as separate widgets. It should instead feel like reading a Markdown document in Obsidian: one quiet reading column where the prompt is a quoted aside, the answer is native prose, and supporting detail folds into the flow.

## What Changes

- Present the transcript as one centered reading column of note-like width, shared by prompts and answers and capped at Obsidian's file line width.
- Render the user prompt as a native-style quoted aside in that column instead of a right-aligned chat bubble. Each message keeps an accessible role description.
- Let an assistant run read as one continuous Markdown document: native `markdown-rendered` typography and block spacing for headings, paragraphs, lists, quotes, and code, with no per-message card and no gap between every Markdown part. Only turn boundaries add space.
- Add one faint, footnote-like line at the end of an assistant run with the model, agent, and elapsed duration when available. Omit missing values rather than showing placeholders.
- Render reasoning and tool activity as compact, collapsed disclosures inside the document flow rather than framed widgets. Tool summaries show an icon, the name, a status or duration, and a one-line input preview; reasoning summaries reuse that row with their own icon and a one-line text preview. Expanded details stay plain text.
- Show each fold's leading icon at rest and swap it for a chevron on hover or focus, turned down while the fold is open.
- Reduce notice noise: successful execution idle records and selection-change records are omitted, failed or interrupted outcomes remain as compact lines, and injected skill, system, or synthetic text collapses behind a short label. Shell and compaction output stays reachable.
- Keep the presentation Obsidian-native: theme variables only, native `markdown-rendered` typography, native `<blockquote>` and `<details>` elements, and no copied `app.css` declarations or new dependencies.
- Keep the existing shell-output, compaction, permission, form, and link behavior. Do not change prompt sending, identity, reconciliation, protocol, persistence, or the composer controls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-chat`: Adds a document-like-transcript requirement: one reading column, a quoted prompt aside, continuous native Markdown for answers, inline supporting disclosures, and an unobtrusive end-of-run footnote. Routine execution and session records stay quiet while failures and the composer execution state remain discoverable.

## Impact

- `src/ui/conversation.ts`: quoted prompt aside, document entry shells, end-of-run footnote, notice filtering, and part composition.
- `src/ui/tool-entry.ts`: compact summary with duration and input preview inside the document flow.
- `src/ui/chat-renderer.ts`: passes model and agent display names to the conversation renderer.
- `styles.css`: adds the reading column, removes message and tool card framing, relies on native Markdown block spacing, and styles the quoted prompt, footnote, and inline disclosures with theme variables.
- `README.md` and `CHANGELOG.md`: describe the document-like transcript and the retained execution and failure visibility.
- Tests: new or extended rendering tests for the quoted prompt, native document shells, footnote, notice filtering, reasoning, and tool summaries; existing interaction and shell tests stay behavior-compatible.
- No API, schema, persistence, protocol, manifest, or dependency changes.
