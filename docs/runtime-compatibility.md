# Runtime compatibility gate

## Automated verification

Task 1.1 verified on Windows with Node.js 26.13.0 and pinned
`@opencode/client` 2.2.2:

- `npm install --save-exact @opencode/client@2.2.2` succeeded.
- `npm test` imports both the Promise client and local service entrypoint
  without discovering or starting a service.
- The suite bundles both entrypoints as ES2021 CommonJS, checks the esbuild
  dependency graph for unbundled packages, and executes the bundle in Node.
  Only native Node modules remain external. Client construction performs no
  requests; authentication and event streaming are not yet tested.
- `npm run build` succeeds with the existing plugin entrypoint.
- The original sample code still fails `npm run lint` (sample names, demo
  interval, console logging). These are existing issues addressed by task 2.1;
  the new tests and ESLint configuration pass their focused lint check.
- `npm audit --omit=dev --audit-level=moderate` reports no vulnerabilities.
  The complete audit reports six development-tooling vulnerabilities (three
  moderate and three high); no automatic audit fixes or tooling downgrades
  were applied.

Run `npm test`, `npm run build`, and `npm run lint` from the repository root.
The smoke bundle is evaluated in memory and is not a release artifact.

## Pending Electron verification

Node success does **not** establish compatibility with Obsidian's Electron
runtime. No Obsidian version or supported OpenCode runtime range has been
verified yet. No service was started or stopped by these checks.

The user approved the disposable Windows vault path
`C:\Users\Jakob\AppData\Local\Temp\opencode\obsidian-test-vault`.
The directory has been prepared. The installed OpenCode executable reports
`opencode v2.2.2`. The Electron check is currently blocked: `obsidian help`
reports that it cannot find a running Obsidian instance. No plugin was installed
and no Electron checks have been performed; task 1.2 remains incomplete.

Open this directory as a vault in Obsidian and enable the Obsidian CLI before
resuming. Do not install into a real vault implicitly.
In the approved vault, record Obsidian, Electron, Node, and
OpenCode versions; verify discovery, authenticated requests, and event
streaming using the bundled client and service helper. Record the chosen
transport and observed results here. Do not alter shared-service registration,
restart an incompatible service, weaken authentication, or change global CORS
configuration. If the documented client approach fails, pause for design
revision before building the full UI.
