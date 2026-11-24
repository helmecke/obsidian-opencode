# Design

## Context

See proposal.md - Why. Three constraints shape the approach:

- `ItemView.contentEl` is rendered by the host as `div.workspace-leaf-content > div.view-content`, so the chat root already carries Obsidian's view-content styling. The plugin adds only `opencode-chat` and, while **Readable line length** is on, `is-readable-line-width`.
- Obsidian's reading typography is not attached to `markdown-rendered`. It lives on `.markdown-preview-view`: `font-family: var(--font-text)`, `font-size: var(--font-preferred-size)`, `line-height: var(--line-height-normal)`, `padding: var(--file-margins)`, `scrollbar-gutter: stable`. A `markdown-rendered` subtree without that ancestor inherits `body`, which is `--font-interface` at `--font-ui-medium` and `--line-height-tight`.
- Each streamed text part is its own `markdown-rendered` root, and the host zeroes `:first-child` / `:last-child` margins. Adjacent parts therefore meet with no space, and an expanded tool fold butts against the next paragraph.

An archived design (`2026-11-23-streamline-chat-transcript`, decisions 2 and 4) settled the reading column and the prohibition on widget-like gaps. This design keeps both and supplies what that change assumed the host was already providing.

## Goals / Non-Goals

**Goals**

- Answers, prompts, and their nested Markdown take the theme's reading typography and block rhythm, and follow a theme or snippet that retunes the reading view.
- The chat view stops restating what the pane already styles.
- The transcript and composer keep one reading measure, now derived from the theme's note margins.

**Non-Goals**

- No change to the answer DOM, streaming model, or part identities; the prompt element becomes a callout (decision 6) and list items gain the host's bullet span (decision 7).
- No change to the composer card, permission callout, disclosure, footnote, or status-line presentation beyond inheriting surrounding colour.
- No alternative layout such as a centered sizer or a fixed-width transcript; decision 2 of the archived change stands.

## Decisions

### 1. The transcript scroll container carries the host reading-view class

`ChatRenderer` adds `markdown-preview-view` alongside `opencode-chat-messages` on the element it creates for the transcript. The host then supplies text font, size, line height, note margins, `overflow-wrap`, and `scrollbar-gutter: stable`; the plugin keeps only what is chat-specific: `flex: 1`, `min-height: 0`, `height: auto`, the readable-width inline inset, and the one `--p-spacing` step it shares with prose (decision 2).

The class is applied to the scroll container rather than the view root, because the root is a flex column that must also hold the composer, and because `.markdown-preview-view` sets height and overflow for a whole surface.

**Alternative considered:** copying the four typography declarations onto `.opencode-chat-messages`. Rejected: it reproduces today's values but not today's behaviour — a theme or snippet that retunes reading-view text, or that targets the reading view for spacing, would still skip the chat. `AGENTS.md` also asks for composition from native surfaces over copied declarations.

**Alternative considered:** applying the class to `contentEl`. Rejected: it would put reading-view height, overflow, and padding on the flex column that also hosts the composer, and every one of those would need neutralising again.

### 2. One spacing step: the theme's paragraph token

Prose seams, a tool or reasoning group, and a turn all take the theme's own paragraph spacing: `.opencode-part-text + .opencode-part-text`, the two seam rules around a detail group, and both sides of a prompt all use `margin-top: var(--p-spacing)`. The plugin keeps no spacing token of its own, so a theme or snippet that retunes paragraph spacing retunes everything at once.

What stays different is *inside* a group: adjacent tool or reasoning rows get no margin, so a run of twenty folds reads as one quiet block rather than twenty paragraphs. A server-side message split can land on a group edge, so two message-level rules carry the same one step across that boundary, keyed on the last part of the previous message and the first part of the next. Both use `:has()` and `:nth-last-child(1 of .opencode-part)`; a browser without them falls back to no extra gap at those few seams.

The cost, accepted deliberately: a turn break now measures the same as a paragraph break. The turn is no longer signalled by extra space, only by the prompt it starts with — a titled callout box — and by the faint footnote that closes a run. Turns before this change carried 20px against 16px, and a whole-token band of 24px was tried between the two; the reader preferred one step and fewer numbers.

The archived prohibition on per-part gaps was about widget-like gaps that make one answer read as a stack of cards. A single `--p-spacing` seam is the theme's paragraph rhythm, so there is nothing widget-like to reintroduce.

**Alternative considered:** a wider band around detail groups and a wider turn gap (`calc(var(--p-spacing) * 1.5)`). Implemented first, then rejected by the reader: two extra tokens, and a prompt sitting closer to the answer than to the previous turn until a third token made both sides equal.

**Alternative considered:** merging contiguous text parts into one `markdown-rendered` root. Rejected for now: it changes the renderer's lifetime and re-render model to fix only text-to-text seams, and would still need the sibling rules for tool folds. It remains the follow-up if prose still reads segmented after this change.

**Alternative considered:** spacing every part by the same amount, tool rows included. Rejected after seeing it: a run of twenty tool calls becomes a 500px column of one-line paragraphs and the transcript stops being scannable.

**Alternative considered:** overriding the host's `:first-child` / `:last-child` reset with higher specificity. Rejected: it fights the host for the same property and undoes the document's own edge behaviour.

### 3. The reading measure comes from the theme's note margins

`.opencode-chat` keeps `padding: 0`, so the host's generic view-content padding does not stack on top of the reading surface. The transcript's block padding is then the host's `--file-margins` applied by `.markdown-preview-view`; the plugin adds only the inline inset for **Readable line length**:

```css
.opencode-chat.is-readable-line-width .opencode-chat-messages {
	padding-inline: max(var(--file-margins-x), calc((100% - var(--file-line-width)) / 2));
}
```

The composer uses the same expression for its inline padding, so it keeps sharing the reading measure while its vertical padding stays chat-tight. With the setting off, both fall back to `--file-margins-x`.

`--file-margins-x` replaces `--size-4-4` as the floor. At a pane narrower than the line width this makes the transcript exactly as wide as a note, where the previous floor was 16px and left the chat 32px wider than the reading view.

### 4. The view root keeps layout only

`color`, `background-color`, and `font-size` leave `.opencode-chat`. The pane supplies text colour and background the way it does for a note, and any snippet that styles the view content reaches the chat. `display: flex`, `flex-direction: column`, `height: 100%`, `min-height: 0`, and `padding: 0` stay, because the composer needs a column that fills the pane and the reading surface must own the padding.

**Alternative considered:** removing `padding: 0` as well. Rejected: the host's view-content padding would then apply outside the reading surface, and the reading measure would no longer match a note's.

### 5. Chrome keeps its own scale

The footnote (`--font-ui-smaller`), disclosure summaries (`--font-ui-small`), status line, tool `<pre>`, and the composer card keep their UI sizing. Only prose inherits reading typography. This preserves the hierarchy between an answer and its supporting detail and keeps the composer's spec'd unified card intact.

### 6. The prompt is a prompt-type callout, not a quotation

The prompt renders as a callout with `data-callout="prompt"`, a title naming the reader, a leading icon, and the host's callout tint. Obsidian styles the callout type itself, so the box, its title colour, its padding, and its accent all come from the theme, and the frame keeps `markdown-rendered` so the host's paragraph rules apply inside it.

That frame has a side effect worth recording: the host zeroes `:first-child` and `:last-child` margins, and the callout is the only child, so the `margin: 1em 0` that `.callout` declares is already gone before this plugin touches it. The space after a prompt therefore belongs to the turn boundary, not to the callout, and it is the same `--p-spacing` step that the rest of the transcript uses, on both sides of the prompt. Restoring the callout's own margin would instead mean overriding the host's edge reset with a copied `1em`, and would put the two sides out of step with everything else.

A blockquote says the user is quoting someone; the user is not. The theme also draws it with the accent bar a quotation gets, which reads as borrowed text rather than input. A callout says "this block is about something", which is what a prompt is.

**Alternative considered:** Obsidian's `[!quote]` callout. Rejected: it removes the accent bar but keeps the quotation semantics, and its gray box is just as framed.

**Alternative considered:** a fenced code block, the terminal-input metaphor. Rejected: monospace stops long, prose-shaped prompts from reading as prose, and the transcript's reading typography stops applying.

**Alternative considered:** an `h5` heading, the cheapest CSS-only marker. Rejected: every prompt would join the document outline, and a multi-line prompt cannot be a heading.

**Alternative considered:** `<dl>`, `<figure>`/`<figcaption>`, `<aside>`, or `<section>`, which are semantically attractive. Rejected: Obsidian styles none of them, so the marker would need declarations copied from a design instead of inherited from the host.

**Alternative considered:** `<details>`, folding the prompt behind a summary. Rejected: it hides the text the reader most often wants to reread.

**Alternative considered:** removing the marker entirely and relying on turn spacing. Rejected: the reader loses the only anchor for their own words in a long transcript.

The scenario key keeps its original name, **Quoted prompt**, because OpenSpec deltas cannot rename scenarios; its body describes the callout, and the prompt is still a quotation of what the reader typed.

### 7. List markers come from the host's list post-processing

Obsidian draws a note's bullets itself: the `ul` carries `has-list-bullet`, `list-style-type` is a zero-width space, the real marker is transparent, and each `li` starts with `<span class="list-bullet">` whose `::after` paints `--list-bullet-size` at `--list-bullet-radius` in `--list-marker-color`. Measured in this vault: a note bullet is a 0.3em round dot in `#ababab`, while the chat's `ul` has no class and no span, so the browser draws its own `disc` in the text colour.

None of that arrives through `MarkdownRenderer.render`; the class and spans are added while a reading-view preview is built. The transcript therefore reproduces the structure after each render: mark each non-task bullet list and prepend one bullet span per item. Ordered lists keep their numbers, task lists keep their checkboxes, and nested lists are handled by the same pass because it walks every `ul` in the block.

The pass runs on each throttled streaming render, so it is bounded by the number of list items in one answer, not by the transcript. If the host ever renames the class or the span, the visible failure is a browser disc — the same as today — and the fallback is the rejected colour-only rule below.

**Alternative considered:** colouring `li::marker` with `--list-marker-color`. Rejected: `::marker` accepts colour and font-size only, so the browser's disc keeps its own shape and spacing and never matches a note's round dot.

**Alternative considered:** accepting the difference and recording it. Rejected: the requirement is that answers read as a Markdown note, and a list is the most common block after a paragraph.

## Risks / Trade-offs

- [A flex child with the host's `height: 100%` overflows the pane] → The plugin sets `height: auto` on the transcript container next to `flex: 1`, and verifies it with the composer visible.
- [A theme styles `.markdown-preview-view` in ways a chat transcript dislikes] → Accepted: that is the inheritance being asked for. If it proves harmful, the fallback is the rejected alternative in decision 1 — the four declarations on the plugin container.
- [A snippet loads after the plugin and overrides the readable-width inline inset with a `padding` shorthand] → Accepted as inheritance; the inline inset remains a plugin concern only while **Readable line length** is on, and the check is a narrow pane.
- [Block spacing between a text part that ends in a heading and a part that starts with prose is paragraph spacing rather than heading spacing] → Accepted; a seam between two independently streamed parts cannot know the other side's block type. It is closer to document rhythm than the current zero.
- [Expanded tool folds now sit beside 16px text while their own body is UI-sized] → Accepted as decision 5; if it reads too small, that is a separate change with its own hierarchy decision.
- [The list-marker pass runs on every throttled streaming render] → Accepted: it is linear in the list items of one answer, which the renderer already re-renders on the same throttle.
- [The host renames `has-list-bullet` or the bullet span in a later version] → The visible failure is the current behaviour, a browser disc; the fallback is the colour-only marker rule rejected in decision 7.

## Migration Plan

Pure presentation change: no persisted data, no service contract, no migration. Rollback is reverting `styles.css` and the container class; the previous values are the ones measured in the proposal.

Verification: `npm test`, `npm run build`, `npm run lint`, then a live check in the development vault with the composer visible, the setting on and off, a narrow sidebar, and one theme or snippet change to the reading view. No disposable test vault exists on this machine, so that pass and a non-default theme remain outstanding and are recorded as a deviation in `docs/runtime-compatibility.md`.

## Open Questions

None.
