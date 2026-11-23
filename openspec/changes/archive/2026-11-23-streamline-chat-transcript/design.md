# Design

## Context

See `proposal.md` for motivation and the `native-chat` delta for the required
behavior.

The transcript is built by `ConversationRenderer` in `src/ui/conversation.ts`.
Each authoritative message becomes one entry with a stable lifetime so streamed
text updates in place. `createEntry` currently adds a visible **You** or
**OpenCode** role label, `styles.css` frames every assistant body and tool entry
as a card, and `textOf` renders every non-user/non-assistant record as plain
notice text. `ToolEntryView` owns the tool `<details>` row and its raw input,
result, and error blocks. `MarkdownBlock` already applies `markdown-rendered`, so
native Obsidian reading typography is available inside each text part.

The host data already supplies the footnote values: `SessionMessageAssistant`
exposes `agent`, `model`, `time.created`, and `time.completed`; tool parts expose
`time.created`, `time.ran`, and `time.completed`. `ChatRenderer` has the loaded
`agents` and `models` lists at refresh time, so display names can be resolved
without new requests. Tests run the UI under jsdom with an Obsidian mock;
`ConversationRenderer` currently has no dedicated rendering test.

Constraints: keep the existing message-level diffing, Markdown streaming and
lifetimes, link routing, pending-prompt recovery, and all composer behavior. Use
theme variables and verified native surfaces only; no copied `app.css`
declarations and no new dependencies.

## Goals / Non-Goals

**Goals:**

- Make the transcript read like a Markdown note in Obsidian's reading view:
  one quiet reading column, a quoted prompt aside, continuous answer prose, and
  supporting detail that folds into the document flow.
- Keep role and execution information discoverable to assistive technology and
  in the composer while removing chat-like chrome.
- Resolve model, agent, and duration labels from data already in state, with
  graceful omission when values are absent.
- Keep the change local to transcript rendering and styling, with focused
  renderer tests.

**Non-Goals:**

- Re-grouping the authoritative message stream into turns, changing the reducer,
  or adding client/protocol calls.
- Keeping chat bubbles or per-message cards for any transcript content.
- Persisting disclosure state, adding copy actions, token/cost readouts, or
  other new transcript features.
- Changing the composer, permission cards, forms, link handling, or recovery
  flows.
- Mobile support; the plugin stays desktop-only.

## Decisions

### 1. Keep message-level entries; the transcript is the document

`ConversationRenderer` keeps one entry per message and one stable part per
content block. The transcript container no longer treats entries as separated
chat items: the container gap is removed, assistant entries add no margin, and a
turn boundary is created by the user prompt's own spacing. This preserves the
diffing model and Markdown/tool lifetimes without re-parenting streamed content.

**Alternative considered:** group consecutive assistant messages into one turn
container. Rejected: it would require moving live parts between parents, would
re-render on every stream append, and complicates the stable part identities the
renderer depends on.

### 2. One centered reading column, shared by prompt and answer

`.opencode-chat-messages` keeps the scroll behavior but centers its content to
Obsidian's note measure using inline padding derived from `--file-line-width`,
for example `padding-inline: max(var(--size-4-4), calc((100% - var(--file-line-width)) / 2))`.
The chat view carries Obsidian's own `is-readable-line-width` class only while
the vault has **Readable line length** enabled, follows the vault's
`config-changed` event, and otherwise leaves the transcript at the pane width
with the base inset. This keeps the measure in the theme's hands: a theme or
snippet that retunes `--file-line-width`, and the user switching the setting
off, both land on the transcript exactly as they do on an open note. The scroll
container still spans the full pane, so the scrollbar stays at the edge; user
and assistant entries fill the reading column. The composer card uses the same
inline inset, so the input sits on the same measure as the notes above it; its
toolbar still wraps within that width. In a narrow sidebar the base inset wins
and the transcript uses the available width without horizontal scrolling.

**Alternative considered:** set `max-width: var(--file-line-width)` on the
scroll container. Rejected: the scrollbar would sit at the column edge instead
of the pane edge, which reads like an embedded widget. **Alternative
considered:** leave the transcript full width. Rejected: long answer lines stop
feeling like a note.

### 3. The user prompt is a native quoted aside

The user entry keeps its accessible group label, but its body becomes a
`<blockquote>` inside a `markdown-rendered` container instead of a right-aligned
bubble. Obsidian's own quote treatment supplies the inset border, padding, and
muted color; the prompt text remains plain, preserved whitespace and is not
parsed as Markdown. The pending prompt uses the same shape and keeps its
**Sending…** or **Not confirmed** line.

Before depending on the native quote rule, verify it in the installed `app.css`;
if the host styles blockquotes only inside a preview container, keep the
`markdown-rendered` wrapper or fall back to the same theme variables on the
plugin class. Do not copy the host declaration.

**Why not a bubble:** a bubble reads as a chat message; a quote reads as a
passage inside a note. **Why keep it visually distinct:** the reader still needs
to find their own prompt, so the quote inset and accessible label remain.

### 4. Assistant runs read as continuous Markdown

The assistant entry loses its border, background, and body padding. Its body
uses no flex gap; part wrappers add no margin, and the native `markdown-rendered`
block margins govern headings, paragraphs, lists, quotes, code, and tables.
Consecutive assistant messages in one run stack without extra space, while the
next user prompt starts a new turn with normal document spacing.

This depends on native Markdown margins and must not reintroduce a per-part
gap. If adjacent parts double their margins, neutralize only the plugin wrapper
margins and let the native rules inside `markdown-rendered` remain the source of
truth.

**Alternative considered:** keep a small gap between parts. Rejected: that is
what makes a document look like a stack of widgets.

### 5. One faint footnote per assistant run

The last assistant message in each contiguous assistant run gets a single faint
line with the resolved model name, agent name, and elapsed duration, in that
order. The duration is computed from the first assistant message's
`time.created` to the last message's `time.completed`; it is formatted as
`0.4s`, `13.4s`, or `1m 12s`. Values that cannot be resolved are omitted, and
the line itself is omitted when no value is available or while the run is still
streaming.

`ChatRenderer` passes two label resolvers through `ConversationOptions`:
`modelLabel(model)` and `agentLabel(agent)`. They look up the refreshed
`state.models` and `state.agents` lists and fall back to the model or agent ID.
The line is updated in place only when its signature changes, so streaming text
updates do not rebuild it. It has no border, background, badge, or control; it
reads as a footnote, not a chat toolbar.

**Alternative considered:** remove the footnote entirely. Rejected for now: it
is the quiet replacement for the removed role labels and keeps model, agent, and
duration discoverable without interrupting the document.

### 6. Reasoning and tools are folds inside the document

Reasoning keeps its `<details>` element and stays collapsed by default with its
Markdown rendering intact. Its summary uses the same compact row as a tool: a
muted leading glyph, the name **Reasoning**, and a one-line preview of the
reasoning text with Markdown markers stripped. The preview updates in place as
the part streams. A shared disclosure affordance shows the entry's own icon at
rest and swaps it for a right-pointing chevron on hover or keyboard focus; an
open fold keeps the chevron turned down. Tool rows use the same affordance with
their wrench icon.

`ToolEntryView` keeps `<details>` and its existing detail bodies, but the summary
becomes a compact line in the document flow: a muted generic tool icon, the tool
name, a status or formatted duration, and a one-line input preview. Completed
tools show their duration instead of the word **Done**; running and failed tools
keep a visible status. The preview uses the first useful string field from the
tool input (`command`, `filePath` or `path`, `pattern`, `query`, `url`,
`description`, otherwise the first string value), collapsed to one line and
truncated for the summary. Expanded input, result, and error blocks remain
text-only, and a disclosure uses no card fill, shadow, or separator.

**Alternative considered:** keep the framed tool card and only remove the
background. Rejected: consecutive tool calls would still read as widgets rather
than note content.

### 7. Make routine records quiet, never invisible failures

Filtering happens in `ConversationRenderer.render` before entries are created:

- `agent-switched`, `model-selected`, and `location-switched` records are
  suppressed; the composer already shows the current selection.
- `idle` records with outcome `succeeded` are suppressed; the composer status
  carries the final execution state.
- `idle` records with outcome `failed` or `interrupted` render as a compact
  status line, including the record's error message when present.
- `compaction` records render as a compact muted line with their existing
  running, completed, or failed text.
- `shell` records become a collapsed **Shell** disclosure with the command in
  the summary and the existing output text in the body.
- `skill`, `synthetic`, `system`, and unknown record types become a collapsed
  disclosure with a short label (for example **Skill · apply** or **System
  note**). The full injected text is available on expansion and is never
  rendered as Markdown or HTML.

This keeps the transcript free of the **Execution succeeded.** line and raw
injected XML while preserving failures, outputs, and the ability to inspect what
the service added to the conversation. Unknown future record types fall back to
the collapsed system-note shape rather than printing their type name.

**Alternative considered:** hide all non-message records. Rejected: this would
discard compaction failures, shell output, and injected-context transparency.

### 8. Test at the renderer seam

A new `tests/conversation.test.mjs` bundles `conversation.ts` with stub Markdown
blocks and asserts the observable DOM: the prompt body is a blockquote with an
accessible role label and no visible role text, assistant bodies are unframed,
one footnote appears on the final assistant message with the expected
model/agent/duration text, reasoning and tool disclosures are collapsed, no
successful idle or selection-change entries appear, failed outcomes are compact,
and skill/system text is collapsed. `ToolEntryView` coverage in
`tests/interactions.test.mjs` gains duration, preview, and icon assertions while
keeping the existing raw-output and status checks.

The reading column and native spacing are visual rules; verify them manually in
the disposable vault rather than asserting CSS in the DOM tests.

## Risks / Trade-offs

- **A quoted prompt could be mistaken for quoted text from the answer** → Keep
  the prompt inset visually distinct, retain the accessible role label, and test
  the markup. Verify the native blockquote rule in the installed `app.css`.
- **The reading column can feel narrow in a sidebar** → The base inset wins when
  the pane is narrower than the note measure, so the column simply uses the
  available width.
- **Removing the per-part gap can expose doubled native margins** → Verify a
  long answer with headings, lists, quotes, and code; neutralize only plugin
  wrapper margins, not native Markdown spacing.
- **Footnote metadata can lag or be incomplete** → Resolve only from loaded
  state, fall back to IDs, omit missing values, and never fetch during rendering.
- **Suppressing successful idle notices could hide the outcome if the composer
  status is not noticed** → The composer status is the required execution
  surface, keeps a tooltip in its compact icon-only form, and failed or
  interrupted outcomes still appear in the transcript.
- **Collapsing shell and injected text could hide actionable content** → The
  disclosures are keyboard reachable, labeled, and expandable; failures remain
  visible and the body text is unchanged.
- **Streaming updates could cause footnote or tool-summary churn** → Keep
  signatures and update only text/attributes in place; do not rebuild the entry
  on each stream tick.
- **Theme or narrow-layout regressions** → Use only theme variables and native
  controls, then verify light, dark, and a narrow sidebar in the disposable test
  vault.
- **Unknown future record types** → Fall back to the collapsed system-note shape
  instead of leaking a raw type string; keep filtering limited to known routine
  types.

## Migration Plan

No persisted data or protocol changes. Implement in this order: notice and
entry shaping in `conversation.ts`; quoted prompt and reading-column classes;
footnote label plumbing in `chat-renderer.ts`; tool summary in `tool-entry.ts`;
`styles.css` document rhythm and column cleanup; renderer and tool tests;
README/CHANGELOG wording. Verify with `npm test`, `npm run build`, and
`npm run lint`, then reload in the disposable vault and check a long answer with
headings, lists, quotes, and code in light, dark, and a narrow sidebar. Rollback
is a revert of the UI modules and `styles.css`; saved conversations and
OpenCode state are unaffected.
