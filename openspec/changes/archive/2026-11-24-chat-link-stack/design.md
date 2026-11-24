# Design

## Context

Chat answers render through `MarkdownBlock` (`src/ui/markdown.ts`), and `attachLinkRouter` intercepts every `a.internal-link` click on the messages container with `preventDefault()` + `stopPropagation()`, then always calls `openLinkText(href, sourcePath, true)`. All modifier semantics are discarded. The chat view (`src/ui/chat-view.ts`) owns the leaf; `src/ui/chat-renderer.ts` builds a `LinkEnvironment` whose `open` currently does `openLinkText(href, sourcePath, true)`.

Relevant Obsidian facts, verified against the installed bundle and `obsidian.d.ts`:

- `Keymap.isModEvent(event)` returns `false | 'tab' | 'split' | 'window'` and matches Obsidian's own internal-link click handler exactly.
- `getLeaf('split')` → `createLeafBySplit(getMostRecentLeaf())` always creates a **new** group; `splitLeaf` defaults to `'vertical'` (right) and `before=true` gives left.
- `OpenViewState.group` feeds `setGroupMember` (linked views), not tab placement; the tab-stack mechanism is `createLeafInParent(parent, index)` plus `leaf.openFile`.
- `WorkspaceTabs.setStacked()` and `vault.getConfig('focusNewTab')` exist in the bundle but are absent from `obsidian.d.ts`.

## Goals / Non-Goals

**Goals:**

- Restore Obsidian's modifier contract inside chat answers without navigating the chat leaf or preventing access to the conversation.
- Give Cmd/Ctrl+Alt+click a sticky, per-chat-tab note group to the right of the chat.

**Non-Goals:**

- Left/right placement, persistence across restarts, keyboard (modifier+Enter) routing, and programmatic `Stack notes` toggling. Each was considered and rejected as out of scope (see Decisions).

## Decisions

### 1. Derive destination from the pointer event, not a hard-coded tab
Use `Keymap.isModEvent(event)` in the router. This is the same call Obsidian's own markdown click handler makes, so the four rows (plain/`tab`/`split`/`window` + middle-click) fall out for free.
*Alternative rejected:* keeping `newLeaf = true` and adding bespoke branches per modifier, which would re-implement and risk drifting from core.

### 2. Intercept `'split'` and route it to a sticky group
Passing `'split'` to `openLinkText` creates a fresh group every click, so Cmd/Ctrl+Alt is handled by the plugin: create the group on first use and append afterwards.
*Alternative rejected:* letting `'split'` pass through natively (no stickiness) — dropped in grilling as the whole point of the feature.

### 3. A `LinkStack` object owned by the chat view, memory only
New `src/ui/link-stack.ts` holds one `WorkspaceLeaf` reference and the create/append/dedupe/focus logic; `chat-view.ts` instantiates it per view. No persistence, so a reload forgets the group and the next Cmd/Ctrl+Alt creates a fresh one.
*Alternative rejected:* adopting a sibling split group on load — guessing at a user layout is riskier than a predictable fresh group.

### 4. Group creation via `createLeafBySplit(chatLeaf, 'vertical')`
Splits to the right of the chat deterministically. Append via `workspace.createLeafInParent(leaf.parent, index)`; the parent is a `WorkspaceTabs` at runtime, and the current typings accept it through structural typing, so the only cast reads the undeclared `children` array to compute the append index. The method itself is public and documented.
*Alternative rejected:* `OpenViewState.group`, which joins a linked-view group rather than placing a tab.

### 5. Deduplicate by file, not by leaf
When the target file is already open as a `MarkdownView` in the group, focus that leaf and apply the heading/block subpath via `openFile(file, { active, eState: { subpath } })` instead of adding a tab.
*Alternative rejected:* always adding a tab (core behaviour) — duplicates pile up across a conversation.

### 6. Focus follows "Always focus new tabs", with a guarded read
Read `app.vault.getConfig('focusNewTab')` through a runtime guard that falls back to focusing when the method is missing, and record it in `docs/runtime-compatibility.md`.
*Alternatives rejected:* always focusing (ignores the preference) and public-API emulation via active-leaf juggling (visibly jittery, mutates history).

### 7. Plain opens reuse a note tab; new tabs follow the chat split
Because the chat leaf cannot navigate, the router picks a `MarkdownView` leaf in the root split for a plain click, preferring one outside the chat's group and falling back to one inside it. With no note tab at all, it adds a tab to the chat's own group. Cmd/Ctrl always appends a new tab there. Both follow the split being used instead of the last focused split or a new group.
*Alternative rejected:* opening a split whenever no note tab is free; live review showed users read that as an unwanted new split rather than a new tab.

### 8. Presentation left to the user
The group opens as normal tabs; the README documents the one-time **Stack notes** menu action. No `setStacked` call and no command execution.
*Alternative rejected:* a guarded internal `setStacked(true)` — depends on an API `obsidian.d.ts` does not declare, against the project's native-first rule.

## Risks / Trade-offs

- [The `focusNewTab` read is undocumented and could change] → Runtime-guarded with a focus fallback; documented as a limitation.
- [Reading `children` for the append index relies on an undeclared runtime shape] → Confined to one helper, verified at runtime; the fallback is a native new tab.
- [Group detection depends on `MarkdownView` type and root split] → Only affects plain-click target selection, never the sticky group path or Cmd/Ctrl tabs.
- [Session-only memory means a restart leaves an orphan group] → Acceptable and predictable; documented.
