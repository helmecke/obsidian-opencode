# UI/UX Standards

Consistent UI/UX is essential for a native-feeling Obsidian plugin experience.

## Table of Contents
- [Sentence Case for UI Text](#sentence-case-for-ui-text)
- [Sentence Case for Locale Files](#sentence-case-for-locale-files)
- [Command Naming Conventions](#command-naming-conventions)
- [Settings & Configuration](#settings--configuration)
- [Declarative Settings (Obsidian 1.13+)](#declarative-settings-obsidian-113)
- [Confirmation Dialogs](#confirmation-dialogs)

---

## Sentence Case for UI Text

### Enforce Sentence Case for UI Text
Rule: `obsidianmd/ui/sentence-case` (fixable with `allowAutoFix: true`)

> **Note (v0.5.0):** This rule is **off** in `recommended` and `recommendedWithLocalesEn` (0.3.0 meant to turn it off, but it stayed on through 0.4.2). The scanner doesn't run it either. Sentence case is still the Obsidian UI convention — opt in to have it checked:
>
> ```javascript
> { files: ["**/*.ts"], rules: { "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true }] } }
> ```

Use sentence case (first word capitalized, rest lowercase except proper nouns) for all UI text.

❌ **INCORRECT**:
```typescript
.setName('Advanced Settings')
.setDesc('Configure Advanced Options')
.setButtonText('Save Changes')
new Notice('File Successfully Saved')
```

✅ **CORRECT**:
```typescript
.setName('Advanced settings')
.setDesc('Configure advanced options')
.setButtonText('Save changes')
new Notice('File successfully saved')
```

Configuration options:
```javascript
'obsidianmd/ui/sentence-case': ['warn', {
  brands: ['Obsidian', 'GitHub'],      // Preserve brand names (replaces the built-in list)
  acronyms: ['TTRPG'],                 // Extra acronyms (adds to the built-in list since v0.6.0)
  enforceCamelCaseLower: true,         // Flag CamelCase words like "AutoReveal"
  allowAutoFix: true,                  // Let --fix rewrite the text (no fix without it)
}]
```

> **`brands` replaces the built-in list** (which includes `Obsidian` and `GitHub`) — list every brand your UI text uses. **`acronyms` adds to the built-in list** (`API`, `URL`, `PDF`, `URI`, `UTC`, `ISO`, `RGB`, `MCP`, and more) since v0.6.0, so list only the ones it lacks. Set `replaceDefaultAcronyms: true` to replace the built-in acronyms, as `acronyms` did through v0.5.1.
>
> ❌ Upgrading to v0.6.0 with `acronyms` meant to leave out some built-in ones — they are now added back:
> ```javascript
> { acronyms: ['API', 'URL'] }   // through v0.5.1: only these two
> ```
> ✅ Keep the old behavior explicitly:
> ```javascript
> { acronyms: ['API', 'URL'], replaceDefaultAcronyms: true }
> ```
>
> Since v0.6.0 the rule also keeps words that keep a capital in English: the pronoun "I", weekdays, months, languages ("Translate to Japanese"), key names ("Press Enter"), letter ranges ("Name (A-Z)"), and, in the default `loose` mode, words in capitals that are not listed acronyms. `ignoreWords` applies to the parts of a hyphenated word ("Dataview-powered"). An `ignoreRegex` that is not a valid regular expression is a configuration error.

Applies to:
- `.setName()`, `.setDesc()`, `.setText()`, `.setTitle()`
- `.setButtonText()`, `.setPlaceholder()`, `.setTooltip()`
- `createEl()` text and attributes
- `new Notice()` messages
- `addCommand()` names
- `.setAttribute()` for `aria-label`, `aria-description`, `title`, `placeholder`
- `textContent`, `innerText` assignments

### Handling Edge Cases: Plugin Names and Acronyms

The sentence-case rule may flag text that intentionally contains uppercase words — plugin names, brand names, or acronyms. The rule is advisory and there are always edge cases, but you can whitelist known terms via `acronyms` and `brands` options instead of suppressing the rule entirely.

❌ **INCORRECT** — suppressing the rule:
```typescript
// eslint-disable-next-line obsidianmd/ui/sentence-case
.setName('Open TTRPG tools - controls')
```

✅ **CORRECT** — configure the rule with your project's terms:
```javascript
'obsidianmd/ui/sentence-case': ['warn', {
  acronyms: ['TTRPG'],  // the built-in API, URL, HTML, … stay (v0.6.0+)
  brands: [
    'Style Settings',
    'TTRPG Tools - Controls',
    'TTRPG Tools',
  ],
}]
```

- **`acronyms`** — uppercase abbreviations that should stay uppercase, in addition to the built-in ones (e.g., `TTRPG`)
- **`brands`** — proper names that should preserve their exact casing (e.g., plugin names like `Style Settings`, `Dataview`)

When a plugin references other plugins or well-known tools in its UI text, add those names to `brands` rather than rewriting them to sentence case.

---

## Sentence Case for Locale Files

Plugins that externalize UI strings into locale files must also enforce sentence case.

### Sentence Case for JSON Locale Files
Rule: `obsidianmd/ui/sentence-case-json` (`warn` in `recommendedWithLocalesEn`; fixable with `allowAutoFix: true`)

Enforces sentence case for English locale strings stored in JSON files (e.g. `en.json`, `locales/en.json`).

❌ **INCORRECT** (`en.json`):
```json
{
  "openSettings": "Open Settings",
  "saveChanges": "Save Changes",
  "deleteFile": "Delete File"
}
```

✅ **CORRECT** (`en.json`):
```json
{
  "openSettings": "Open settings",
  "saveChanges": "Save changes",
  "deleteFile": "Delete file"
}
```

---

### Sentence Case for TypeScript/JavaScript Locale Modules
Rule: `obsidianmd/ui/sentence-case-locale-module` (`warn` in `recommendedWithLocalesEn`; fixable with `allowAutoFix: true`)

Enforces sentence case for English locale strings exported from TS/JS modules (e.g. `en.ts`, `locales/en.js`).

❌ **INCORRECT** (`en.ts`):
```typescript
export default {
  openSettings: "Open Settings",
  saveChanges: "Save Changes",
};
```

✅ **CORRECT** (`en.ts`):
```typescript
export default {
  openSettings: "Open settings",
  saveChanges: "Save changes",
};
```

---

### Enable Locale Checks with recommendedWithLocalesEn

To check English locale files, use the `recommendedWithLocalesEn` config instead of `recommended`:

```javascript
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores(["node_modules", "dist", "main.js", "esbuild.config.mjs", "version-bump.mjs"]),
  // Also lints en.json, en-US.ts, en/*.json, ... locale files
  ...obsidianmd.configs.recommendedWithLocalesEn,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["eslint.config.*"] } },
    },
  },
]);
```

`recommendedWithLocalesEn` adds, on top of `recommended`:
- `ui/sentence-case-json` — JSON files named `en`, `en-*`, `en_*`, or `en.*` (any case), or under a directory named so (`en/`, `en-US/`)
- `ui/sentence-case-locale-module` — `.ts`/`.js`/`.cjs`/`.mjs` modules matched the same way

`english.json`, `entries.json`, and `env.json` are not matched. Inline `ui/sentence-case` stays off in both configs; opt in as shown above.

---

## Command Naming Conventions

### No Redundant "Command" in Names
Rules:
- `obsidianmd/commands/no-command-in-command-id`
- `obsidianmd/commands/no-command-in-command-name`

❌ **INCORRECT**:
```typescript
this.addCommand({
  id: 'open-settings-command',
  name: 'Open settings command',
});
```

✅ **CORRECT**:
```typescript
this.addCommand({
  id: 'open-settings',
  name: 'Open settings',
});

// "command" as what the command acts on is fine (not reported since v0.5.1)
this.addCommand({
  id: 'copy-command-id',
  name: 'Copy URI for command',
});
```

Rationale: Commands are already listed as commands. Since v0.5.1 these rules report "command" only as a redundant label — after a separator or in brackets at the start or end ("Command: open note"), or as the last word after a name that reads without it ("Open settings command"). Since v0.6.0, "command" as the last word after only a space, where it is the noun the command acts on ("Create slash command", "Edit shell command"), is not reported, and `no-command-in-command-id` reports a last "command" in the ID (`create-slash-command`) only where the name does without the word.

---

### No Plugin ID/Name in Command IDs
Rules:
- `obsidianmd/commands/no-plugin-id-in-command-id`
- `obsidianmd/commands/no-plugin-name-in-command-name`

❌ **INCORRECT**:
```typescript
// If plugin id is "my-plugin"
this.addCommand({
  id: 'my-plugin-open-settings',
  name: 'My Plugin: Open settings',
});
```

✅ **CORRECT**:
```typescript
this.addCommand({
  id: 'open-settings',
  name: 'Open settings',
});
```

Rationale: Obsidian automatically namespaces commands with the plugin ID. Since v0.6.0, a name that starts with the plugin name as a word of the sentence, followed by a lowercase word ("Zoom in" in a plugin named "Zoom"), is not reported, nor is its ID (`zoom-in`). Since v0.5.1, `no-plugin-id-in-command-id` reports the plugin ID only where it **starts** the command ID: `show-calendar-view` in a plugin with id `calendar` names what the command acts on and is fine. Accepting a rename suggestion breaks users' hotkeys, `executeCommandById()` calls, `obsidian://` URIs, and other plugins that use the old ID — only rename before the first release.

---

### No Default Hotkeys
Rule: `obsidianmd/commands/no-default-hotkeys`

❌ **INCORRECT**:
```typescript
this.addCommand({
  id: 'toggle-feature',
  name: 'Toggle feature',
  hotkeys: [{ modifiers: ['Mod'], key: 't' }],  // Don't set defaults
});
```

✅ **CORRECT**:
```typescript
this.addCommand({
  id: 'toggle-feature',
  name: 'Toggle feature',
  // Let users configure their own hotkeys
});
```

Rationale: Avoid hotkey conflicts. Let users choose their own shortcuts. `hotkeys: []` sets no hotkey and is not reported (v0.5.1).

---

### Use Appropriate Command Callbacks
Rule: Official guidelines

Choose the right callback type for your commands:

```typescript
// callback: Always executes
this.addCommand({
  id: 'show-info',
  name: 'Show info',
  callback: () => {
    new Notice('Always works!');
  }
});

// checkCallback: Conditional execution (returns true if executed)
this.addCommand({
  id: 'format-selection',
  name: 'Format selection',
  checkCallback: (checking: boolean) => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      if (!checking) {
        // Perform the action
        const editor = view.editor;
        const selection = editor.getSelection();
        editor.replaceSelection(selection.toUpperCase());
      }
      return true;
    }
    return false;
  }
});

// editorCallback: Only available when editor is active
this.addCommand({
  id: 'insert-timestamp',
  name: 'Insert timestamp',
  editorCallback: (editor: Editor, view: MarkdownView) => {
    editor.replaceSelection(new Date().toISOString());
  }
});
```

Rationale:
- Use `callback` for unconditional execution
- Use `checkCallback` for conditional execution (command only shows when available)
- Use `editorCallback` for editor-dependent commands

### `checkCallback` Must Read `checking`
Rule: `obsidianmd/commands/check-callback-uses-checking` (`warn`, v0.6.0)

Obsidian calls `checkCallback` and `editorCheckCallback` with `checking` set to `true` to ask whether the command is available — for example while the command palette is open. A callback that never reads `checking` runs its action on every check.

❌ **INCORRECT**:
```typescript
this.addCommand({
  id: 'format-selection',
  name: 'Format selection',
  checkCallback: () => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    view.editor.replaceSelection(view.editor.getSelection().toUpperCase());  // runs on every check
    return true;
  }
});
```

✅ **CORRECT**:
```typescript
this.addCommand({
  id: 'format-selection',
  name: 'Format selection',
  checkCallback: (checking: boolean) => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    if (!checking) {
      view.editor.replaceSelection(view.editor.getSelection().toUpperCase());
    }
    return true;
  }
});
```

If the command is always available, use `callback` or `editorCallback` instead of a `checkCallback` that ignores `checking`. Not reported: a callback passed by name or defined elsewhere, a destructured first parameter, or one that reads `arguments`.

---

## Settings & Configuration

### No Manual HTML Headings in Settings
Rule: `obsidianmd/settings-tab/no-manual-html-headings`

❌ **INCORRECT**:
```typescript
containerEl.createEl('h3', { text: 'Appearance' });
```

✅ **CORRECT**:
```typescript
new Setting(containerEl).setName('Appearance').setHeading();
```

Rationale: Use Obsidian's built-in heading API for consistency. Since v0.5.1 the rule reports only headings created on the settings tab's `containerEl` — not those inside a container of your own, a setting's name or description, or a `Notice` fragment.

---

### No Problematic Settings Headings
Rule: `obsidianmd/settings-tab/no-problematic-settings-headings` (auto-fixable at the top of the tab)

❌ **INCORRECT**:
```typescript
new Setting(containerEl)
  .setName('General settings')  // Don't use "General"
  .setHeading();

new Setting(containerEl)
  .setName('Plugin options')  // Don't use "settings" or "options"
  .setHeading();

new Setting(containerEl)
  .setName('My Plugin settings')  // Don't use the plugin name as the heading
  .setHeading();
```

✅ **CORRECT**:
```typescript
new Setting(containerEl)
  .setName('Appearance')
  .setHeading();

new Setting(containerEl)
  .setName('Behavior')
  .setHeading();

new Setting(containerEl)
  .setName('Advanced')
  .setHeading();
```

Rationale: Avoid redundant words in settings headings:
- Don't use "settings" or "options" (user already knows they're in settings)
- Don't use generic "General" heading
- Don't use the plugin name as the heading (already shown in settings tab title)

Since v0.5.1 "settings" and "options" match as whole words only, and "General" or the plugin name are reported only when they are the whole heading apart from "settings"/"options" — so "Inline Numerals" in a plugin named Numerals is fine.

Since v0.6.0 a "General" or plugin-name heading is reported only at the **top** of the tab, where nothing comes before it in `display()` (a heading right after an unconditional `this.containerEl.empty()` counts as the top). Lower down — a "General" section after an "Appearance" one — it starts a section of its own, and removing it would merge that section's settings into the one above. The plugin name is compared whole: for "Style Settings", a "Style" heading is fine. "settings" or "options" as what a verb acts on ("Export and import settings", "Reset all settings") is not reported.

---

### Don't Await a `Setting` or UI Component
Rule: `obsidianmd/no-await-chainable` (`error`, v0.6.0; needs type information)

`Setting` and the UI components (`ButtonComponent`, `TextComponent`, `ToggleComponent`, and every other `BaseComponent` subclass) have a `then(cb)` for chaining: it calls `cb` with the object and returns the object. That makes them thenables, so `await` treats them as promises — and resolution calls `then` again, forever. The `await` never settles and the app stops responding. `@typescript-eslint/await-thenable` doesn't catch it, because the objects *are* thenables. `tsc` reports it as TS1062, but esbuild skips type-checking, so a build without `tsc` ships it — the rule also catches it there.

❌ **INCORRECT**:
```typescript
async display(): Promise<void> {
  await new Setting(this.containerEl)          // never settles
    .setName('Name')
    .addText((text) => text.setValue(this.plugin.settings.name));
}

async function makeButton(el: HTMLElement): Promise<ButtonComponent> {
  return new ButtonComponent(el);              // returning one from an async function hangs too
}
```

✅ **CORRECT**:
```typescript
display(): void {
  new Setting(this.containerEl)
    .setName('Name')
    .addText((text) => text.setValue(this.plugin.settings.name));
}

function makeButton(el: HTMLElement): ButtonComponent {
  return new ButtonComponent(el);
}
```

Also reported: `Setting | undefined` and your own subclasses of `Setting`/`BaseComponent`. Not reported: a class that declares its own `then`, and returning a component from a function that isn't `async`.

---

## Declarative Settings (Obsidian 1.13+)

As of Obsidian 1.13.0, `PluginSettingTab` supports a declarative API: override `getSettingDefinitions()` to return an array of setting definitions. Obsidian handles rendering, persistence, validation, and search indexing. You describe the settings, not the DOM.

### Migration Paths

| Your `minAppVersion` | Path | What to do |
|---|---|---|
| `>= 1.13.0` | **Path A** (preferred) | Implement `getSettingDefinitions()` only. Delete `display()`. |
| `< 1.13.0` | **Path B** (dual support) | Keep `display()` and add `getSettingDefinitions()` alongside it. Both must stay in sync. |
| `< 1.13.0`, no need for new features | No change | The API is opt-in. Leave the plugin as-is. |

### Path A: Clean 1.13-only Migration

1. Bump `minAppVersion` to `"1.13.0"` in `manifest.json`.
2. Override `getSettingDefinitions()` — return an array of definition objects.
3. For each setting, write `{ name, desc, control: { type, key } }`. The `key` maps to a property on `this.plugin.settings`. Obsidian reads, writes, and persists automatically.
4. Move value-shape validation (regex, range, format) from `onChange` into a `validate` callback on the control.
5. Delete `display()` and remove unused imports (typically `Setting`).

```typescript
import { App, PluginSettingTab } from 'obsidian';

class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions() {
    return [
      {
        name: 'Enable feature',
        desc: 'Turns the feature on or off.',
        control: { type: 'toggle', key: 'enabled' },
      },
      {
        name: 'Mode',
        control: {
          type: 'dropdown',
          key: 'mode',
          defaultValue: 'fast',
          options: { fast: 'Fast', thorough: 'Thorough' },
        },
      },
      {
        name: 'Cache key',
        desc: 'Alphanumeric only.',
        control: {
          type: 'text',
          key: 'cacheKey',
          placeholder: 'default',
          validate: (value: string) =>
            /^[a-z0-9]*$/i.test(value.trim()) ? undefined : 'Use letters and digits only.',
        },
      },
    ];
  }
}
```

### Path B: Dual Support

Keep `display()` as-is and add `getSettingDefinitions()` alongside it. On 1.13.0+, Obsidian calls `getSettingDefinitions()` and skips `display()`. On older versions, `display()` runs as before.

> **Warning:** The two implementations must stay in sync. Every time you add or change a setting, update both. If the maintenance overhead isn't worth it, prefer Path A and bump `minAppVersion`.

### Control Types

`toggle`, `dropdown`, `text`, `textarea`, `number`, `slider`, `color`, `file`, `folder`

### Definition Kinds

`control`, `render`, and `action` on a definition are mutually exclusive. Definitions can also be empty (heading-only), groups, lists (`addItem`/`onDelete`/`onReorder`), and sub-pages.

### When to Use `render` Instead of `control`

Use a `render` callback when `control` + `validate` isn't enough:
- **Side effects on change** — call a method, update a status bar, refresh another view
- **Inverted or derived values** — a toggle that drives a string config, a slider that drives a complex calculation
- **Custom suggesters** — a command picker, tag picker, or anything using `AbstractInputSuggest`

For conditional visibility, use the `visible` predicate instead of `render`.

### Shared Definition Fields

Every definition (`control`, `render`, `action`, or empty) accepts these alongside `name`:

| Field | Type | Purpose |
|---|---|---|
| `desc` | `string \| DocumentFragment` | Description. A fragment's `textContent` is what search indexes. |
| `aliases` | `string[]` | Extra search terms — synonyms users might type instead of `name`. |
| `visible` | `boolean \| (() => boolean)` | Hides the item and excludes it from search for that render cycle. |
| `searchable` | `boolean \| (() => boolean)` | Keeps the item rendered but out of global search. |

Controls additionally accept `disabled: boolean | (() => boolean)`, which greys out the control while leaving it visible — the right choice for "unavailable because X", where hiding the setting would just be confusing.

`visible` and `disabled` are re-evaluated on every render, so the function forms can reflect runtime state.

### Refreshing: `update()` vs `refreshDomState()`

Two different costs — pick by what changed:

- **`refreshDomState()`** — re-evaluates every `visible` and `disabled` predicate and applies the result to the existing DOM. No re-render. Use this from a `render` callback's `onChange` after mutating state that *other* settings' predicates read.
- **`update()`** — re-runs `getSettingDefinitions()` and re-renders. Use when the *structure* changed: items added or removed, list rows reordered.

Reach for `refreshDomState()` first; a full `update()` to toggle one control's enabled state is wasted work and drops focus.

### Data-Shape Gotcha

Auto-persist calls `saveData(plugin.settings)`, so **all persisted plugin data must live inside the `settings` object**. Sibling keys stored via `saveData()` outside `settings` will be clobbered.

❌ **INCORRECT**:
```typescript
// Sibling key — clobbered when declarative settings auto-save
await this.saveData({ ...this.settings, bookmarks: this.bookmarks });
```

✅ **CORRECT**:
```typescript
// All persisted data under settings
interface MySettings {
  enabled: boolean;
  bookmarks: string[];
}
```

**Escape hatch:** if you genuinely can't co-locate the data — settings split across multiple files, or a key that must live outside `settings` for backward compatibility — override `getControlValue(key)` and `setControlValue(key, value)` on your tab. `PluginSettingTab` implements them against `plugin.settings`; override both together and each control's `key` routes through your storage instead.

```typescript
class MySettingTab extends PluginSettingTab {
  getControlValue(key: string): unknown {
    if (key === 'apiToken') return this.plugin.secrets.apiToken;
    return super.getControlValue(key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'apiToken') {
      this.plugin.secrets.apiToken = value as string;
      await this.plugin.saveSecrets();
      return;
    }
    await super.setControlValue(key, value);
  }
}
```

Prefer reshaping your data over this. An override is a second persistence path to keep correct.

### Pitfalls

- `getSettingDefinitions()` runs on every `update()` AND once at registration for search indexing. Keep it cheap — no I/O, no network calls.
- A `render` callback does **not** auto-save. Always `await this.plugin.saveData(this.plugin.settings)` after mutating settings.
- `validate` is a UI gate — it shows inline errors but doesn't modify stored values. Re-validate stored data in `loadSettings()` for data saved by older plugin versions.
- Page names must be unique among siblings at the same depth.
- When an `action` callback depends on row position, use the `index` argument — don't capture index from an outer `map` (it goes stale after reorder/delete).
- To refresh the tab after data changes, call `this.update()` — or `this.refreshDomState()` when only `visible`/`disabled` predicates changed. On 1.13.0+, `display()` is bypassed when `getSettingDefinitions()` returns a non-empty array.
- `validate` also runs once on mount, so a stored value that's already invalid surfaces its error immediately — but the bad value stays in `plugin.settings` until the user fixes it.
- `desc` accepts `string` or `DocumentFragment`. For rich descriptions with formatting or links, pass a `DocumentFragment` built with `createFragment(...)`.

### Relationship to Existing Rules

- Heading rules (`no-manual-html-headings`, `no-problematic-settings-headings`) apply to legacy `display()` implementations
- Sentence case still applies to `name`, `desc`, and `options` values in declarative definitions
- Settings window opened in a new window since 1.13 — see [Target Main Workspace from Settings](../reference/code-quality.md#target-main-workspace-from-settings-v1130)

---

## Confirmation Dialogs

### Use `ConfirmationModal` Instead of a Custom Confirm Modal
Rule: API best practice - MANDATORY when `minAppVersion >= 1.13.0`

Obsidian 1.13.0 ships `ConfirmationModal`, a `Modal` subclass for "are you sure?" prompts. It renders the native button row, handles button order and spacing, closes itself after a button's click handler resolves, and lets you choose which button gets initial focus. Do not hand-build a `Modal` subclass with its own button row for this.

❌ **INCORRECT**:
```typescript
class ConfirmDeleteModal extends Modal {
  constructor(app: App, private onConfirm: () => void) {
    super(app);
  }

  onOpen() {
    this.setTitle('Delete template');
    this.contentEl.createEl('p', { text: 'This cannot be undone.' });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    new ButtonComponent(buttons)
      .setButtonText('Delete')
      .setWarning()
      .onClick(() => {
        this.onConfirm();
        this.close();
      });
    new ButtonComponent(buttons)
      .setButtonText('Cancel')
      .onClick(() => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

✅ **CORRECT**:
```typescript
import { ConfirmationModal } from 'obsidian';

new ConfirmationModal(this.app)
  .setTitle('Delete template')
  .setContent('This cannot be undone.')
  .addButton(btn => btn
    .setButtonText('Delete')
    .setDestructive()
    .setCta()
    .onClick(async () => {
      await this.plugin.deleteTemplate(id);
    }))
  .addCancelButton()
  .open();
```

**API summary** (all `@since 1.13.0`):

| Member | Purpose |
|--------|---------|
| `addButton(cb)` | Add a `ConfirmationButton` to the button row |
| `addCancelButton(text?)` | Add the dismissal button, with an optional label |
| `addCheckbox(label, cb)` | Add a checkbox, e.g. "Don't ask again" |
| `addClass(cls)` | Add a CSS class to the modal |
| `buttonContainerEl` | The button row element |
| `ConfirmationButton.onClick(handler)` | Runs the handler, then closes the modal. Return a truthy value to keep it open (e.g. to show a validation error) |
| `ConfirmationButton.setInitialFocus()` | Focus this button when the modal opens |
| `ConfirmationButton.setSecondary()` | Place a tertiary action apart from the primary/cancel pair |
| `ConfirmationButton.setCancel()` | Style a custom button as the dismissal action |

`setTitle()` and `setContent()` are inherited from `Modal`. `setContent()` accepts a `string` or a `DocumentFragment`. For richer bodies, write to `contentEl` directly.

### Awaiting the User's Choice

When calling code needs a `boolean`, wrap `ConfirmationModal` in a promise and resolve from `onClose`. That way Escape, clicking outside the modal, and the cancel button all resolve `false`.

❌ **INCORRECT**:
```typescript
// Resolves only when Confirm is clicked. Escape or Cancel leaves the promise pending forever.
function confirm(app: App, message: string): Promise<boolean> {
  return new Promise(resolve => {
    new ConfirmationModal(app)
      .setContent(message)
      .addButton(btn => btn.setButtonText('Confirm').setCta().onClick(() => resolve(true)))
      .addCancelButton()
      .open();
  });
}
```

✅ **CORRECT**:
```typescript
function confirm(app: App, message: string, confirmText: string): Promise<boolean> {
  return new Promise(resolve => {
    let confirmed = false;
    const modal = new ConfirmationModal(app)
      .setContent(message)
      .addCancelButton()
      .addButton(btn => btn
        .setButtonText(confirmText)
        .setCta()
        .setInitialFocus()
        .onClick(() => {
          confirmed = true;
        }));
    modal.onClose = () => resolve(confirmed);
    modal.open();
  });
}
```

### Deleting Files: Use `promptForDeletion()`

To ask the user before deleting a vault file or folder, call `FileManager.promptForDeletion()` (since 0.15.0). It runs Obsidian's native deletion flow, the same one the core file explorer uses: confirmation dialog first, then deletion. It resolves `true` if the user confirmed and `false` if they cancelled. It works on every supported `minAppVersion`.

❌ **INCORRECT**:
```typescript
if (await confirm(this.app, `Delete "${file.name}"?`, 'Delete')) {
  await this.app.fileManager.trashFile(file);
}
```

✅ **CORRECT**:
```typescript
// Shows the native prompt and deletes the file if confirmed. Do not call trashFile() afterwards.
await this.app.fileManager.promptForDeletion(file);
```

### Supporting Obsidian Below 1.13.0

`ConfirmationModal` does not exist before 1.13.0. If `minAppVersion` is lower, either raise `minAppVersion` to `1.13.0` or keep a small `Modal`-based fallback, and delete the fallback when you raise `minAppVersion`. Do not import `ConfirmationModal` while declaring an older `minAppVersion` (see rule 27 in `SKILL.md`).

❌ **INCORRECT**:
```json
{ "minAppVersion": "1.5.0" }
```
```typescript
import { ConfirmationModal } from 'obsidian'; // undefined at runtime on 1.5–1.12
```

✅ **CORRECT**:
```json
{ "minAppVersion": "1.13.0" }
```
```typescript
import { ConfirmationModal } from 'obsidian';
```
