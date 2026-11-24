# Tasks

## 1. Renderer: recognize subagent results

- [x] 1.1 In `src/ui/conversation.ts`, add the recognition and embed-title helpers: a subagent result when `metadata.source === 'subagent'` with string `text`, the `${agent} subagent · ${description}` title built with `oneLine` and a `· cancelled` suffix for a non-completed `state`, and envelope stripping of one leading `<subagent …>` and one trailing `</subagent>`. Verify with new `tests/conversation.test.mjs` cases: a marked record is recognized, a record with the same text but no metadata is not, and missing agent or description still yields a sane title.
- [x] 1.2 Add the `embed` entry kind and its render branch: native embed classes, an embed-title element, the static Markdown block (`set(text, true)`) inside the embed content, and an `aria-label` equal to the title. Verify the test asserts the embed classes, the title text, the Markdown block inside the embed content, no custom caption or blockquote, no `<summary>` or `<pre>`, the wrapper tags absent from the document, and the accessible label.
- [x] 1.3 Keep every other record unchanged and narrow the existing blanket assertion that injected text is never Markdown-rendered so it covers skill, system, shell-sourced, page-answer, and unmarked synthetics only. Verify the existing quiet-transcript test still passes for those records, plus a new cancelled-state case showing the suffix and the report body.
- [x] 1.4 Guard repeated rendering and disposal: an unchanged subagent record on a later render keeps its embed title, embed, and Markdown nodes, and removing the record disposes its Markdown block. Verify with a renderer test that compares node identity across two renders and that the container no longer holds the embed after the record disappears.

## 2. Embed presentation

- [x] 2.1 In `styles.css`, keep only the paragraph step around the subagent record; leave the embed frame, title type, and padding to the host's `.markdown-embed` and `.embed-title` rules. Verify by inspecting the diff that no `--embed-*` or host padding declaration is copied, and that no custom caption or quote selector remains.
- [x] 2.2 Check the composed embed in the disposable vault in light and dark themes, with **Readable line length** both on and off, confirming the host embed frame and title appear, the title names the agent and task, and no doubled margin appears where an embed closes a turn.

## 3. Integration

- [x] 3.1 Run `npm test`, `npm run build`, and `npm run lint`; verify all three pass with no new warnings.
- [x] 3.2 Run one live conversation that delegates to a subagent in the disposable vault, confirming the report appears at its place with the embed title, no wrapper tags, working links, and collapsed skill/system notes elsewhere; append the observation and any limitation to `docs/runtime-compatibility.md`.

## Workflow follow-up

- Archive `render-subagent-quotes` after review, syncing the `native-chat` delta into the main spec.
