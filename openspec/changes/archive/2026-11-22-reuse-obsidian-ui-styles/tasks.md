# Tasks

## 1. Native control foundations

- [x] 1.1 Add a `setTooltip` mock to `tests/dom-helper.mjs` that mirrors the host (sets `aria-label` and any tooltip-position attribute) and verify `npm test` still passes with the existing suites unchanged.
- [x] 1.2 Add `src/ui/native-controls.ts` with `createIconButton(container, options)` (real `<button>`, `clickable-icon`, `setIcon`, `setTooltip`) and `setNativeDisabled(button, disabled)` (sets both `disabled` and `aria-disabled`). Verify a new `tests/native-controls.test.mjs` passes under `npm test` and asserts the class, icon child, accessible label, and both disabled states.

## 2. Composer and view chrome

- [x] 2.1 Move the Send and Stop controls in `src/ui/chat-composer.ts` to `createIconButton`/`setNativeDisabled`; keep `.opencode-composer-icon` for sizing and `.opencode-composer-send` for the accent circle only. Verify `tests/plugin-shell.test.mjs` asserts `clickable-icon`, the accessible name, and synchronized `disabled` + `aria-disabled` after running/stopped and empty-input updates, and that `npm test` passes.
- [x] 2.2 Move New conversation and Retry discovery in `src/ui/chat-renderer.ts` to the same helper, and leave the conversation select with sizing/truncation classes only. Verify the shell test asserts the icon-button class and accessible names, retry still disables/enables across connection phases, and conversation option selection is unchanged; run `npm test`.
- [x] 2.3 Remove the duplicated icon-button hover/focus/disabled/color rules and the select border/background/height/hover/focus/disabled rules from `styles.css`, keeping only Send's accent rules, toolbar sizing, and truncation. Verify by reading the remaining `.opencode-composer-icon`/select rules (no native state reimplementation) and by `npm test`.

## 3. Agent forms and interaction cards

- [x] 3.1 Rebuild agent-form fields in `src/ui/form-card.ts` as `setting-item` rows with `setting-item-info`/`-name`/`-description`/`-control`, native inputs, selects, and grouped checkboxes; use `setting-item-error` + `is-invalid` for field errors and `hidden` for conditional visibility while preserving field order, keys, defaults, validation, and rebuild behavior. Verify `tests/interactions.test.mjs` asserts the native row structure, error class/text, hidden required rows, input order, submission payload, and submit/cancel disabled states; run `npm test`.
- [x] 3.2 Convert `src/ui/permission-card.ts` to warning callout markup (`callout`, `data-callout="warning"`, title/icon/inner, content) with the existing actions inside the content. Verify the interaction test asserts the callout class/type, all decision text and scope warning, the three decisions, and the disabled Always allow state; run `npm test`.
- [x] 3.3 Remove the duplicated `.opencode-form-field`/control/card rules and `.opencode-permission` card rules from `styles.css`, keeping only the actions-row and callout-content layout adjustments the plugin needs. Verify the interaction tests still pass and a read of the remaining form/permission rules shows no native border, background, input, or checkbox restyling.

## 4. Markdown, messages, and retained CSS

- [x] 4.1 Add `markdown-rendered` to the answer container in `src/ui/markdown.ts` and delete the duplicated first/last-child margin rules from `styles.css`. Verify `tests/markdown.test.mjs` (or an added assertion there) confirms the class and rendering behavior, and `npm test` passes.
- [x] 4.2 Audit the remaining message, status, prompt, tool, reasoning, and suggestion rules against the verified host surface and add a short native-dependency comment block at the top of `styles.css` listing `clickable-icon`, native form controls, `setting-item*`, `callout*`, and `markdown-rendered`. Verify every remaining `.opencode-*` rule maps to a retained chat-specific structure and `target`/`node` lists no unused selectors; run `npm run lint`.
- [x] 4.3 Confirm no other module needs a native replacement by reading `conversation.ts`, `tool-entry.ts`, `chat-interactions-panel.ts`, and `chat-options.ts`; record any deliberately kept custom structure in the `styles.css` comment. Verify `npm test` passes and no new component API or dependency was introduced (check `git diff --stat` and `package.json`).

## 5. Release and integration verification

- [x] 5.1 Add an Unreleased changelog line describing the native Obsidian styling reuse, and verify it names the user-visible outcome without claiming new features.
- [x] 5.2 Run `npm test`, `npm run lint`, and `npm run build`, and verify all three succeed with no generated artifacts committed.
- [x] 5.3 Load the build in the disposable test vault and verify light and dark themes, a narrow sidebar, keyboard focus on every icon button and selector, disabled Send/Stop, the permission callout, and form submission. Record any visual deviation from the previous composer that was accepted by the native-styles scope.

## Workflow follow-up

- [x] Documentation gate: the Unreleased `CHANGELOG.md` bullet (5.1) records the user-visible outcome. README behavior text needs no change because controls, flows, and copy are unchanged; `AGENTS.md` gains the native-first Styling guidance this change establishes, and `docs/runtime-compatibility.md` records the outcome and delivery metrics.
- [x] `adr.md`/`adr/` check: this repository keeps no `adr.md` manifest and no `adr/` directory, so there are no durable ADR files to place. The decisions remain in `design.md` and the `AGENTS.md` Styling section.
- [x] Traceability check: no separate TRACEABILITY manifest exists; the project's traceability row is the metrics table in `docs/runtime-compatibility.md`, updated with the archive folder after the move.
- Archive the change after review and acceptance.
