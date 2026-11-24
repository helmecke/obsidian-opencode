# Design

## Context

See `proposal.md` for motivation. The renderer currently classifies every record into one of four kinds in `src/ui/conversation.ts`: `user`, `assistant`, `notice` (`idle`, `compaction`), or `disclosure` (`shell`, `skill`, `synthetic`, `system`, unknown). A disclosure renders one `<summary>` label and a `<pre>` body, so all injected text — including a subagent report — is unformatted and hidden until expanded.

Three facts from the current code and host constrain the approach:

- `MarkdownLike` is created by the view (`src/ui/chat-renderer.ts`) as a `MarkdownBlock` (`src/ui/markdown.ts`), whose constructor always creates its own `.opencode-markdown.markdown-rendered` div inside the given container. `set(text, true)` renders immediately; the helper keeps its own child component lifetime.
- Obsidian renders a note embed as `.internal-embed.markdown-embed.inline-embed.is-loaded` with a `.embed-title.markdown-embed-title` and a `.markdown-embed-content` body. A live `![[Acceptance/Example]]` render on this host produced that structure, and the installed `app.css` supplies `.markdown-embed` frame/tint rules, `.embed-title` typography, and `.markdown-embed-content>.markdown-preview-view { padding: var(--embed-padding) }`.
- The live service delivers a subagent result as a `synthetic` message with `metadata.source: "subagent"`, `agent`, `state`, and `childID` in metadata, the task description in the record's own `description` field, and a body wrapped as `<subagent sessionID="…" state="…" description="…">…Markdown…</subagent>`. In the local store, 213 of 688 synthetic records are subagent results (211 `completed`, 2 `cancelled`), 61 are shell-sourced, 6 are page answers, and 385 carry no metadata. Subagent bodies have a median length of 12k characters (p90 28k); descriptions are 60 characters or fewer.

## Goals / Non-Goals

**Goals:**

- One new transcript kind for subagent results, recognized only from record metadata.
- An embed that uses the host's own embed styling rather than a plugin imitation.
- Reuse the existing static Markdown path and lifetime/disposal behavior.
- Keep every other record kind byte-for-byte as it is today.

**Non-Goals:**

- No change to how shell-sourced or page-answer synthetics are shown; they stay generic notes.
- No new setting, length cap, collapse control, raw-text toggle, or per-record menu.
- No embed `src`/`alt` or navigation affordance: the report is not a vault note.
- No change to transcript order, scrolling, the composer, restored-state validation, or the service contract.
- No attempt to reconstruct a subagent transcript from `childID`.

## Decisions

### 1. Recognize by `metadata.source`, never by text shape

A synthetic record is a subagent result when `metadata` is an object, `metadata.source === 'subagent'`, and `text` is a string. `agent` and `state` are read from the same object with optional-string handling; the task description comes from the record's `description` field, with a metadata `description` accepted as a fallback. A missing agent yields the noun **Subagent** and a missing description leaves the embed title without a task. If the condition fails, the record falls through to today's generic disclosure, so malformed or future payloads stay safe.

Text sniffing (`/^<subagent/`) and wrapper parsing were considered and rejected: the metadata is already present on live and restored records, 213 real records agree with the wrapper's attributes, and a model-authored body could legitimately start with that string.

### 2. A new `embed` entry kind, not a disclosure variant

`entryKind` gains `'embed'`; `createEntry` keeps the existing `opencode-message opencode-message-${type}` root and body structure, and `updateEntry` gains an `'embed'` branch. A static signature of `title + '\n' + body` guards re-rendering: a subagent record never streams, and long bodies must not be re-rendered on every unrelated event.

A disclosure with a different summary was rejected because the settled design makes the report visible. A blockquote with a custom caption was the earlier shape; the embed passes the attribution to the host's embed title and frame instead.

### 3. Structure: a native Markdown embed around one Markdown block

```
.opencode-message.opencode-message-synthetic.opencode-message-subagent   (role=group)
  .opencode-message-body.opencode-message-body-embed
    .internal-embed.markdown-embed.inline-embed.is-loaded
      .embed-title.markdown-embed-title     "Explore subagent · Task title · cancelled"
      .markdown-embed-content
        .markdown-preview-view.markdown-rendered
          .opencode-markdown.markdown-rendered   (created by MarkdownBlock)
```

The embed classes are Obsidian's own, so `.markdown-embed` supplies the frame and tint and `.embed-title` supplies the title typography. The `.markdown-preview-view` wrapper receives the host's embed padding and reading rules; the inner `.opencode-markdown` is the existing static Markdown block. The embed intentionally has no `src`, `alt`, or link control, because it presents a report rather than a vault note.

`styles.css` adds only the step around the transcript record (`margin-block: var(--p-spacing)`). It copies no `--embed-*` token, frame, border, or padding declaration from `app.css`, and it keeps no `opencode-subagent-caption` or `opencode-subagent-quote` selector.

### 4. Strip only the wrapper envelope; leave the body alone

`stripSubagentWrapper` removes one leading `<subagent …>` tag and one trailing `</subagent>` tag, then trims. It does not parse attributes, and the embed title never depends on them. If a body has no wrapper, it is rendered as-is. Everything between the tags — headings, lists, tables, code, links, and any raw HTML — goes through `MarkdownBlock` unchanged, exactly as an assistant part would.

Rendering the wrapper as literal text was rejected as noise; extracting it through a DOM parser was rejected as more machinery than an envelope removal needs.

### 5. Trust follows the existing Markdown path

Subagent text is model-authored content like an assistant part, so `MarkdownRenderer` is the right renderer and its HTML behavior matches the answer already on screen. The "never render injected text as Markdown" rule remains for skill, system, and unmarked synthetic text, whose bodies are read as literal data. The conversation test's blanket assertion narrows accordingly.

### 6. Complete labels, one line, no truncation of meaning

The embed title is `${agent} subagent · ${description}`, built with the existing `oneLine` helper (80 characters for the description) and suffixed `· cancelled` when `state` is present and not `completed`. The same string is the root's `aria-label`, so the accessible name matches what is read. `entryLabel` returns the same title for the new kind. Agent names (`Explore`, `General`) are data and stay as the service sends them; literal plugin copy stays sentence case.

### 7. No new state, storage, or lifecycle

The renderer receives the metadata through `SessionMessageInfo` already; `validateSessionMessage` leaves unknown extra fields intact, and this change adds no validation that could reject a record the service accepts. The Markdown child joins the entry's existing `markdowns` set and is disposed with the entry.

## Risks / Trade-offs

- **A 12k–28k-character report now sits inside the host embed's scroll area** → Native embed behavior, including `--embed-max-height`; the full report stays in the DOM and Markdown, with nothing truncated. The outer record still takes the normal paragraph step so the flow keeps its rhythm.
- **The host embed classes must match Obsidian's current DOM** → Verified against a live `![[Acceptance/Example]]` render and the installed `app.css`; acceptance checks the frame and title in the disposable vault under both themes. A copied fallback rule is deliberately avoided.
- **Raw HTML inside a subagent report now renders where it was inert before** → Same trust level as assistant answers, which already pass through `MarkdownRenderer`; no sanitizer is claimed or added.
- **The unit-test Markdown stub only sets text, so it cannot prove real Markdown output** → Test the structure, title, wrapper stripping, and class placement at the renderer seam; verify actual typography, links, and embed styling manually.
- **Two `.markdown-rendered` frames nest (preview wrapper and Markdown block)** → The class carries no frame of its own; it scopes host reading rules. Confirm spacing in acceptance; if a doubled margin appears, adjust only the plugin's own margin, not the host rule.

## Migration Plan

No migration. The change is presentation-only: existing sessions render differently on the next view refresh, all other records keep their current output, and reverting the renderer branch restores the previous transcript without data loss.
