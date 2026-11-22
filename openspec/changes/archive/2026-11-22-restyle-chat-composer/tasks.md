# Tasks

## 1. Composer card structure and controls

- [x] 1.1 Rebuild `ChatComposer` markup as an outer footer, an `.opencode-composer-card`, the existing `.opencode-chat-input` textarea, a `.opencode-composer-toolbar` with start/end groups, and the prompt-actions row; replace text **Send** with an `arrow-up` icon button using `setIcon`, and keep the current disabled rules. Verify with `npx tsc -noEmit -skipLibCheck` and by opening chat to confirm the card renders.
- [x] 1.2 Move the agent and model selects from the header into the composer's end group, format them as compact pills, and move option filling, selection signatures, and disabled-state handling into `ChatComposer.update()`; delegate `ChatRenderer`'s selector getters to the composer and register change handlers there. Verify the agent/model switching test in `tests/plugin-shell.test.mjs` still passes with `node --test tests/plugin-shell.test.mjs`.
- [x] 1.3 Move the stop button into the composer's start group as a `square` icon button that is present only while execution is running, preserving `Stop` disabled/accessibility behavior and `ChatView.stopButton`. Verify the stop/interrupt assertions in `tests/plugin-shell.test.mjs` pass with `node --test tests/plugin-shell.test.mjs`.
- [x] 1.4 Move the uncertain-send row inside the card below the toolbar, keep **Reconcile and retry** and **Return text to editor**, and make the row collapse when empty. Verify the prompt recovery tests with `node --test tests/prompt.test.mjs` and exercise an uncertain send in the view.
- [x] 1.5 Implement textarea auto-growth (reset to auto, cap at 40vh, internal scroll beyond it) and reuse it from `setText`/`clearIf`; update the placeholder to mention only supported actions (`Plan, build, or ask. Ctrl/Cmd+Enter sends; Shift+Enter adds a line.`). Verify typing several lines grows the field to the cap and restored drafts size correctly.

## 2. Styling and accessibility

- [x] 2.1 Add `.opencode-composer-card`, toolbar, compact select pill, icon-button, focus-within, hover, disabled, and responsive wrap styles using only Obsidian theme variables; remove the old full-width composer bar/textarea/actions styling that conflicts. Verify visually in a light theme, a dark theme, and a main-tab width.
- [x] 2.2 Resize the view to a narrow sidebar and confirm every control remains reachable without horizontal scrolling, the model pill truncates with its full value available in the tooltip, and the send button keeps its size.
- [x] 2.3 Give the selects and icon buttons accessible names (`aria-label`) and tooltips, keep icon-only controls out of the tab order when hidden (stop while idle), and ensure no attach/voice/shield/command/skill controls render. Add DOM assertions for these names, the absence of unsupported controls, and stop visibility to `tests/plugin-shell.test.mjs`; verify with `node --test tests/plugin-shell.test.mjs`.
- [x] 2.4 Verify keyboard use: Tab reaches the agent select, model select, and send button; the card shows a visible focus ring; `Mod+Enter` still sends only from the composer. Confirm by keyboard-only interaction in Obsidian.

## 3. Documentation

- [x] 3.1 Update the README's composer and execution sections to describe the single card, where agent/model selection now lives, the icon send/stop controls, and the unchanged shortcuts. Verify the described controls match the built view.

## 4. Integration verification

- [x] 4.1 Run the full suite with `npm test` and confirm no regressions.
- [x] 4.2 Run `npm run lint` and `npm run build`, then install the build into a test vault and reload the plugin.
- [x] 4.3 In the loaded plugin, exercise send, agent/model switching, stop during execution, uncertain-send recovery, light/dark themes, and narrow-sidebar layout; confirm messages, header, and conversation selection are unchanged.

## Workflow follow-up

- Archive the change after review and acceptance.
