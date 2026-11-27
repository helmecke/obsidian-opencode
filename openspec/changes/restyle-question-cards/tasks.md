# Tasks

## 1. Question card shell

- [ ] 1.1 Rebuild the `opencode-form` container as a native question callout: `callout` classes, `data-callout="question"`, help-circle icon, `form.title` (fallback "Agent question"), fields inside `callout-content`, error line and actions after them. Verify DOM assertions in `tests/interactions.test.mjs` find the callout, its title and default title.
- [ ] 1.2 Keep card identity across updates: preserved values, busy disable, unsupported-field block and external links continue to work. Verify the existing form-card tests in `tests/interactions.test.mjs` pass with updated selectors.

## 2. Choice fields

- [ ] 2.1 Render a `string` field with options as a labelled radio group of native option rows, each showing its label and `FormOption.description`. Verify by selecting an option row in a headless test and asserting the submitted value.
- [ ] 2.2 Render a `multiselect` field as native checkbox option rows, preserving selected-array submission. Verify by toggling two rows and asserting the submitted array.
- [ ] 2.3 Strip a `(Recommended)` marker from visible option labels and show a `Recommended` tag on that row. Verify with a labelled option in `tests/interactions.test.mjs` and a style-contract check for the tag class.
- [ ] 2.4 Replace the dropdown custom entry with a revealed **Other…** row: selecting it shows and focuses the text field and submits its text; selecting a normal option hides it. Apply the same row to `multiselect` with comma-separated values included only while the row is checked. Verify both paths in `tests/interactions.test.mjs`.
- [ ] 2.5 Keep required markers, per-field errors, conditional visibility, form-level errors and `aria-live` wiring intact. Verify the corresponding assertions in `tests/interactions.test.mjs`.

## 3. Styling

- [ ] 3.1 Add scoped `.opencode-form` rules in `styles.css`: column field layout inside the callout, option row spacing and hover, description indentation, recommended tag, revealed custom field, start-aligned footer. Verify `tests/style-contract.test.mjs` asserts the new classes and that no color literals or `!important` are introduced.

## 4. Verification

- [ ] 4.1 Run `npm test`, `npm run build` and `npm run lint`; all pass with no new warnings.
- [ ] 4.2 In a disposable vault, open a form with options, option descriptions, a recommended label and a custom answer; answer by row, by Other… and by multiselect, then cancel a second form and confirm the dock focus returns to the composer.

## Workflow follow-up

- The plan PR is opened by the planning run and awaits approval.
- Start implementation only from a separate apply run after the plan is approved.
- Archive the change on `openspec/restyle-question-cards` after review and merge.
