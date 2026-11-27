# Tasks

## 1. Composer sending key

- [x] 1.1 Extract the send button's disabled expression in `src/ui/chat-composer.ts` into one `canSend(state)` predicate and keep `update()` rendering the button from it; verify the existing composer tests still pass.
- [x] 1.2 Send on plain `Enter` in the existing textarea key handler: skip `isComposing`, `keyCode === 229`, `event.repeat`, `event.defaultPrevented`, and any `Shift`/`Ctrl`/`Cmd`/`Alt` combination, then `preventDefault()` and send only when `canSend` holds; verify with tests that a sendable composer sends, and that an empty, running, busy, unconfirmed-prompt, or not-ready composer neither sends nor inserts a newline.
- [x] 1.3 Let modified `Enter` fall through to the textarea and confirm in tests that `Shift+Enter` and `Ctrl/Cmd+Enter` insert a line without sending; verify the pairing-key behavior is unchanged for `[`, `]`, and Backspace.
- [x] 1.4 Change the placeholder to `Plan, build, or ask.` and verify no key hint remains in the composer markup.
- [x] 1.5 Add the composer tests to `tests/chat-composer.test.mjs` covering on-send, on-blocked, composition, repeat, and modified keys, and verify `npm test` passes for that file.

## 2. Popover precedence and chord removal

- [x] 2.1 Track openness in `ComposerSuggest` by overriding the public `open()` and `close()` methods and expose a getter, without reading `isOpen`; verify with a test that the getter follows open and close, including the dispose path.
- [x] 2.2 Drop the popover's `Mod+Enter` scope registration and its `onSend` constructor parameter, and update the call site in `src/ui/chat-renderer.ts`; verify `tests/composer-suggest.test.mjs` no longer expects a scope handler and that `npm run build` type-checks the new signature.
- [x] 2.3 Pass the openness getter into `ChatComposer` as the completion guard and skip `Enter`-send while it returns true; verify with a test that `Enter` with an open popover sends nothing and that the next `Enter` after closing sends once.
- [ ] 2.4 Remove the view-local `Mod+Enter` scope registration from `src/ui/chat-renderer.ts` and its cleanup; verify no `Mod`–`Enter` registration remains under `src/` and that the renderer test passes.

## 3. Documentation

- [ ] 3.1 Update the composer section of `README.md` to describe `Enter` sending and `Shift+Enter` adding a line, and remove every claim that `Ctrl/Cmd+Enter` sends (including the popover paragraphs); verify by searching the README for `Ctrl`/`Cmd` send statements.
- [ ] 3.2 Add an Unreleased `CHANGELOG.md` bullet naming the swap, including that `Ctrl/Cmd+Enter` no longer sends; verify it states the user-visible outcome without claiming a setting or service change.
- [ ] 3.3 Append new verification evidence to `docs/runtime-compatibility.md` for this binding without rewriting older records; verify the entry names the Obsidian version, both layouts, and any limitation observed.

## 4. Integration verification

- [ ] 4.1 Run `npm test`, `npm run build`, and `npm run lint`; verify all three pass.
- [ ] 4.2 Accept in a disposable vault: `Enter` sends, `Shift+Enter` adds a line, `Ctrl/Cmd+Enter` no longer sends, `Enter` is inert while running and while a prompt awaits confirmation, an open `[[`/`$`//` popover takes the first `Enter` and the second sends, and IME confirmation does not send; verify in both a main tab and a right sidebar.

## Workflow follow-up

- Commit each completed task on `openspec/send-on-enter`.
- Archive the change after implementation and acceptance, then run `gh pr ready`.
