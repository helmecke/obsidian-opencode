# Development

Build, test, and install the plugin in a disposable vault. The README covers
installation for users; this page covers the development workflow.

## Environment

- Current LTS Node.js and npm. This is separate from Obsidian's embedded Node
  runtime.
- The plugin is written in TypeScript, bundled with esbuild, and typed against
  `obsidian` and `@opencode/client` `2.2.2`.
- `npm` and `esbuild` are the project's chosen tooling; `package.json` scripts
  and `esbuild.config.mjs` depend on them.

## Install dependencies

```sh
npm ci
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch and rebuild during development |
| `npm run build` | Type-check and produce the production bundle |
| `npm test` | Run the Node test suite in `tests/` |
| `npm run lint` | Lint with `eslint-plugin-obsidianmd` rules |
| `npm run version` | Bump `manifest.json` and `versions.json` through `version-bump.mjs` |

## Build and install in a disposable vault

1. Run the checks:

   ```sh
   npm test
   npm run build
   npm run lint
   ```

2. Create `.obsidian/plugins/opencode-chat/` in a disposable desktop test
   vault. Copy `main.js`, `manifest.json`, and `styles.css` from the repository
   root into that directory. Do not install into a real vault as part of this
   check.
3. Reload Obsidian and enable **OpenCode** under
   **Settings → Community plugins**. Enabling the plugin alone does not contact
   or start OpenCode.

For iterative work, run `npm run dev`, copy the rebuilt artifacts, and reload the
plugin. Use a disposable vault that you create for testing, kept outside your
real vault.

Do not commit generated `main.js`, probe bundles, or `node_modules`.

## What the automated checks cover

`npm test` covers connection and discovery safety, executable resolution and
version validation, managed spawn arguments and environment, ephemeral ports,
readiness, lifecycle and orphan handling, shared-versus-managed fallback, session
scoping and persistence, event reduction, synchronization and recovery, prompt
identity, link routing and Markdown batching, form validation, permission
payloads, tool entries, composer completion, and the native view controls.

The suite bundles the entrypoints and executes them in Node with a strict
Obsidian mock. It uses in-process loopback HTTP fixtures and temporary
registrations; it does not touch the user's service or vault.

Automated checks do not replace manual acceptance. The live Obsidian runs and
their remaining limitations are recorded in
[runtime compatibility](runtime-compatibility.md).

## Release artifacts

A release needs `main.js`, `manifest.json`, and `styles.css` at the top level of
the plugin folder in the vault and as individual assets on the GitHub release.
The tag must exactly match `manifest.json`'s `version`, without a leading `v`.
See `AGENTS.md` for versioning rules and the compatibility policy.
