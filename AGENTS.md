# OpenCode for Obsidian — agent instructions

Project-specific guidance for agents working in this repository. Obsidian's
general plugin rules follow below.

## Project overview

- A desktop-only Obsidian community plugin: `opencode-chat`, displayed as
  **OpenCode**. It is a client for a separately installed local OpenCode 2
  service.
- OpenCode owns the service process, execution, and transcript. The plugin
  handles discovery and managed startup, a native chat view, composer `[[`, `$`,
  and `/` completion, vault links, tool entries, permission cards, agent forms,
  and reconnection.
- TypeScript in `src/` is bundled by esbuild into `main.js`. Release artifacts
  are `main.js`, `manifest.json`, and `styles.css`.
- The plugin is not published in the community catalog.

## Read first

| Document | Read it before |
| --- | --- |
| [Architecture](docs/architecture.md) | Changing discovery, service lifecycle, synchronization, persistence, or module ownership |
| [Development](docs/development.md) | Building, testing, linting, or installing into the disposable vault |
| [Runtime compatibility](docs/runtime-compatibility.md) | Changing the version gate, or recording new verification evidence |
| [Client contract review](docs/client-contract-review.md) | Changing required endpoints, events, prompt identity, permission, or form handling |
| [README](README.md) | Writing user-facing documentation |
| `openspec/specs/` and `openspec/changes/archive/` | Checking the behavior contract and why it exists |

The README is for users only: what the plugin is, how to install it, how to
configure and use it, and its privacy posture. Put internals, verification
records, and build details in `docs/`; put agent workflow rules here.

## Checks

Run all three before calling work complete:

```sh
npm test
npm run build
npm run lint
```

The suite covers connection safety, managed runtime, synchronization and
recovery, prompt identity, completion, Markdown routing, forms, permissions, and
view controls. Automated checks do not replace manual Obsidian acceptance. Live
runs are recorded in [runtime compatibility](docs/runtime-compatibility.md);
append new evidence and limitations there instead of rewriting older records.

Manual acceptance uses a disposable test vault that you choose and keep outside
your real vault. Never commit generated `main.js`, probe bundles, or
`node_modules`.

## Change workflow

In OpenChamber, run every OpenSpec change in its own worktree: load the
`openchamber-change-worktree` skill before creating, applying, verifying, or
archiving a change. Other clients skip the worktree and keep their normal flow.

## Hard invariants

- **Shared service ownership**: reuse a healthy shared service read-only. Never
  start, stop, restart, replace, or reconfigure it, and never write its
  `service.json`. Managed startup is allowed only when discovery reports
  `absent` or `stale`.
- **Credentials**: service authentication is transient. Never persist or log
  credentials, transcripts, drafts, or vault contents. Plugin data is limited to
  the executable path, automatic-startup preference, reasoning-display
  preference, active-note attachment preference, last selected model and
  variant, and the managed orphan record.
- **No workarounds**: do not edit the registration, change CORS, weaken
  authentication, patch the bundled client, or globally replace `fetch` to fix a
  connection.
- **Compatibility**: accept stable `>=2.2.2 <3.0.0` with valid build metadata
  only after the required API and event contracts pass. An incompatible service
  stays untouched.
- **Vault scope**: the vault is a working directory, not a security sandbox.
  Never describe local service access as offline model processing.
- **Composer references**: `[[Note]]` stays visible prompt text and attaches the
  referenced note as a structured file reference. `$skill` attaches the skill by
  ID and stays visible in the text. `/command` runs a known leading command;
  unknown names send as ordinary prompts. The active note and editor selection
  are attached only on an explicit action, unless the off-by-default
  active-note preference enables automatic attachment for sends.
- **Recovery never replays** a prompt, decision, or execution. Reuse the stable
  `msg_` prompt identity when reconciling.

## Architecture map

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | Plugin lifecycle wiring only |
| `src/settings.ts` | Persisted settings and the settings tab |
| `src/opencode/` | Discovery, compatibility, transport, sessions, executable resolution, managed runtime |
| `src/state/` | Event ingestion, reducer, prompt coordinator, interactions, synchronization |
| `src/ui/` | Chat view, composer and completion, renderer, Markdown and links, forms, permissions, tool entries |
| `styles.css` | Chat-specific styles plus the native Obsidian surfaces they rely on |

Keep `main.ts` thin and split files beyond roughly 200–300 lines into focused
modules.

## Obsidian plugin rules

### Environment and tooling

Use npm and esbuild as defined in `package.json`; the build and check commands
are in [development](docs/development.md). `npm run dev` watches and rebuilds;
copy the artifacts and reload the plugin to test changes.

### Manifest rules (`manifest.json`)

Must include:

- `id` (stable after release; matches the vault folder `opencode-chat`)
- `name`
- `version` (SemVer `x.y.z`)
- `minAppVersion`
- `description`
- `isDesktopOnly` (`true` for this plugin)
- optional `author`, `authorUrl`, `fundingUrl`

Keep `minAppVersion` accurate when using newer APIs. Canonical requirements:
https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

### Commands and settings

- Register user-facing commands with `this.addCommand(...)` and stable IDs.
- Provide defaults and validation for every setting; persist with
  `loadData()` / `saveData()` and re-render the UI after changes.
- Register and clean up DOM, app, and interval listeners with the `register*`
  helpers so reload and unload do not leak.

### Versioning and releases

- Bump `version` in `manifest.json` and update `versions.json` (plugin version →
  minimum app version); `npm run version` handles both.
- Create a GitHub release whose tag exactly matches `manifest.json`'s version,
  without a leading `v`. Pushing that tag runs
  `.github/workflows/release.yml`, which builds and creates a draft release with
  `manifest.json`, `main.js`, and `styles.css` as individual assets.
- Follow the catalog process after the initial release.

### Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**:

- Default to local operation. Make network requests only for an explicit
  user-facing feature, and document external services, data sent, and risks in
  the README and settings.
- No hidden telemetry and no remote code, remote scripts, or auto-updates
  outside normal releases.
- Read and write only what the feature needs inside the vault. Never collect
  vault contents, filenames, or personal information without explicit consent.
- Avoid deceptive patterns, ads, and spammy notifications.

### UX and copy

- Sentence case for headings, buttons, and titles.
- Action-oriented imperatives in step-by-step copy.
- **Bold** literal UI labels; prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

### Performance

- Keep startup light and defer heavy work; avoid long work in `onload`.
- Batch disk access and avoid excessive vault scans.
- Debounce or throttle expensive work triggered by file system events.

### Coding conventions

- TypeScript with `"strict": true`.
- Single responsibility per module; clear boundaries.
- Bundle everything into `main.js` with no unbundled runtime dependencies.
- Prefer `async/await`; handle errors so users see an actionable state rather
  than a silent failure.
- This plugin is desktop-only, so Node APIs are acceptable where needed, but
  keep them behind the existing adapters.

### Styling

Practice **native first**: build the interface from Obsidian's own theme and
components, and verify the host really provides what you reach for.

- Use theme variables (`--background-primary`, `--text-muted`, `--size-4-*`)
  for colors, spacing, and type.
- Use existing app classes for standard surfaces: `clickable-icon`, native
  `button`/`select`/`input` (with `mod-cta` and `mod-warning` variants),
  `setting-item*`, `callout*`, and `markdown-rendered`.
- Use public APIs where they fit: `setIcon`, `setTooltip`, `MarkdownRenderer`,
  and `Setting` for settings rows.
- Verify a class against the installed `app.css` and an API against
  `obsidian.d.ts` before depending on it. Utility classes such as `.text-muted`
  and internal component classes are not stable.
- Choose a native equivalent only when it preserves the element's semantics and
  layout. Keep a small custom structure for chat-specific parts (message bubbles,
  tool entries, composer layout), and document in `styles.css` which native
  surfaces it relies on.
- Compose from native pieces rather than copying declarations out of `app.css`,
  so theme and accessibility updates flow through.

### Mobile

The plugin is `isDesktopOnly: true` and mobile is unsupported. Do not add mobile
compatibility claims or test assumptions.

### Agent do/don't

**Do**

- Add commands with stable IDs.
- Provide defaults and validation in settings.
- Write idempotent load/unload paths.
- Use `this.register*` for everything that needs cleanup.
- Record new live evidence in `docs/runtime-compatibility.md`.

**Don't**

- Introduce network calls without an obvious user-facing reason and
  documentation.
- Require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.
- Turn the README into an engineering log.

## Troubleshooting

- Plugin doesn't load after a build: confirm `main.js` and `manifest.json` are at
  the top level of `<Vault>/.obsidian/plugins/opencode-chat/`.
- Build issues: run `npm run build` or `npm run dev`.
- Commands missing: verify `addCommand` runs during `onload` and IDs are unique.
- Settings not persisting: await `loadData`/`saveData` and re-render the UI.
- Discovery problems: follow the ownership rules above before changing
  anything; consult the OpenCode V2 troubleshooting guide for diagnostics.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
- OpenCode V2 docs: https://opencode.ai/v2/docs
