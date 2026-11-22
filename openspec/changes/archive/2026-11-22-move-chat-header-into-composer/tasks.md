# Tasks

## 1. Composer toolbar structure

- [x] 1.1 In `src/ui/chat-composer.ts`, create `.opencode-composer-meta` inside `.opencode-composer-toolbar-start`, after the reserved Stop slot, and expose it through a getter; verify `npm run build` passes the TypeScript check with no unused or missing members.

## 2. Renderer relocation

- [x] 2.1 In `src/ui/chat-renderer.ts`, stop creating `.opencode-chat-header` and `.opencode-chat-conversations`; create the status element (with `role="status"` and `aria-live="polite"`), the Retry discovery icon button (using `setIcon` with `refresh-cw`, accessible name and tooltip), the Conversation select (no visible label, accessible name and tooltip), and the New conversation icon button (using `setIcon` with `message-square-plus`, accessible name and tooltip) inside `composer.metaElement`; keep the existing `updateStatus()` / `updateConversations()` logic, handlers, and getters unchanged.
- [x] 2.2 Update `tests/plugin-shell.test.mjs` so the shell and reopen assertions require the status, retry, conversation selector, and new button inside the composer toolbar's start group and require zero `.opencode-chat-header` and `.opencode-chat-conversations` elements; assert the icon-only buttons expose accessible names, tooltips, and Lucide icons; keep the existing status text, retry enablement, and conversation switching assertions.
- [x] 2.3 Run `node --test tests/plugin-shell.test.mjs` and confirm the relocated-control, icon-accessibility, retry, and conversation tests pass.

## 3. Toolbar styling

- [x] 3.1 In `styles.css`, remove the `.opencode-chat-header`, `.opencode-chat-heading`, and `.opencode-chat-conversations` rules and add `.opencode-composer-meta` styles inside the toolbar's start group, compact icon-button and label-free select styles, and a readable wrapping status; reuse the existing composer icon-button treatment; verify in the test vault that a narrow sidebar shows every control and the status without horizontal scrolling.

## 4. Documentation and integration

- [x] 4.1 Update `README.md` (Conversations and Messages and execution sections) to describe the status, Retry discovery, Conversation selector, and New conversation in the bottom composer toolbar, including the icon actions and their tooltips, and confirm the rendered steps match the current UI.
- [x] 4.2 Run `npm test`, `npm run lint`, and `npm run build`; verify all pass.
- [x] 4.3 In the loaded plugin, check connect, retry after failure, switch and create conversations, send a message, start/stop execution, uncertain-send recovery, and light/dark themes; verify the toolbar meta controls expose tooltips and accessible names, the transcript has no separate header rows, and the toolbar remains keyboard operable and wraps in a narrow sidebar.

## Workflow follow-up

- The `native-chat` delta spec is final: the placement revision does not change its requirements, and its accessible-name clause already covers the icon actions.
- Archive the change after review and verification are complete.
