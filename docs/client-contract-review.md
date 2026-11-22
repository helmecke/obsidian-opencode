# Client and runtime contract review (task 1.3)

Independent, read-only review for the compatibility revision in
`openspec/changes/add-native-opencode-chat`. It compares the pinned
`@opencode/client` 2.2.2 with the published 2.3.2 package and the OpenCode
server/protocol/schema sources at tags `v2.2.2` through `v2.3.2`, with the
plugin call sites in:

- `src/opencode/sessions.ts`
- `src/state/synchronization.ts`
- `src/state/prompt-coordinator.ts`
- `src/state/session-reducer.ts`
- `src/state/event-ingestion.ts`
- `src/opencode/discovery.ts`
- `src/opencode/node-fetch.ts`
- `src/opencode/api-contract.ts`
- `src/opencode/api-shapes.ts`

This review does **not** claim live service, Electron, prompt, permission, or
form acceptance. No prompt or decision was sent, no service was started,
stopped, replaced, or reconfigured, and no shared registration or configuration
was changed. The working tree already contained a range gate, API-shape
validation, and first-token handling while this review was performed; the
conclusions below assess the underlying contracts, not the acceptance status of
that implementation.

## Artefacts compared

| Artefact | Version | How it was established |
| --- | --- | --- |
| Pinned client | 2.2.2 | `node_modules/@opencode/client/package.json`; installed by the repository `package-lock.json` |
| Published client | 2.3.2 | Extracted npm archive at `C:/Users/Jakob/AppData/Local/Temp/opencode/package`; byte-identical to `npm pack @opencode/client@2.3.2` (SHA-1 `39f211db5f0f5ea7d098f554fd29f91affd70762`) |
| Schema/protocol | 2.2.2 installed | Transitive packages of the pinned client |
| Server source | `v2.2.2`…`v2.3.2` | Raw upstream files from `github.com/anomalyco/opencode` at each tag |

The 2.3.2 archive inspected here is the published package, not a repository
checkout. Server source at a tag is evidence about that release's implementation,
not proof that the user's installed or running service is that exact build.

## 1. Registration and authentication

No contract difference was found between 2.2.2 and 2.3.2.

- `Service.fallback()` is unchanged. It resolves
  `$XDG_STATE_HOME/opencode/service.json`, falling back to
  `~/.local/state/opencode/service.json`.
- `Service.Info` is unchanged: `id`, `version`, `url`, `pid`, `password`, with
  `url` and `pid` required. The CLI registration writer at
  `packages/cli/src/services/service-registration.ts` is byte-identical and
  publishes the same five fields. A managed `serve --service` process always
  generates a password unless one is configured (`packages/cli/src/server-process.ts`).
- `Service.headers()` is byte-identical. It produces
  `Authorization: Basic base64("opencode:" + password)`.
- `GET /api/info` and its `ServerInfo` schema are identical:
  `version`, `pid`, `hostname?`, `urls`, `paths.tmp`, `capabilities?`. Identity
  checking by `pid` and `version` remains valid.
- The authorization middleware and server auth source are identical.
  `/api/info` still answers HTTP 401 without credentials.
- Both `matchesVersion()` and the service probe implementation are identical.
  A version predicate is still evaluated against the same strings.

Consequence: registration bytes, authentication headers, health probing, and
identity comparison are not reasons to narrow or widen the runtime range.

## 2. Required endpoints and payloads

The generated client paths, methods, request shapes, and success statuses used
by this plugin are unchanged from 2.2.2 to 2.3.2. The upstream protocol groups
and server handlers for these operations are also unchanged across
`v2.2.2`, `v2.2.3`, `v2.2.4`, `v2.2.5`, `v2.3.0`, `v2.3.1`, and `v2.3.2`,
apart from the differences listed in section 7.

| Plugin operation | Generated client call | Endpoint / payload | Notes |
| --- | --- | --- | --- |
| List vault sessions | `session.list` | `GET /api/session` with `directory`, `order`, `cursor` | Response `{ data: SessionInfo[], cursor: { previous?, next? } }` |
| Create session | `session.create` | `POST /api/session` with `location: { directory }` | Returns `SessionInfo`; server canonicalises the location |
| Load session | `session.get` | `GET /api/session/{sessionID}` | Returns `SessionInfo`; server derives location from the session |
| Load messages | `message.list` | `GET /api/session/{sessionID}/message` with `order`, `cursor` | `order: 'asc'` / `'desc'`; opaque cursor |
| Active sessions | `session.active` | `GET /api/session/active` | Map of `sessionID -> { type: 'running' }` |
| List agents | `agent.list` | `GET /api/agent?location[directory]=…` | Returns `{ location, data }` |
| List models | `model.list` | `GET /api/model?location[directory]=…` | Returns `{ location, data }`; `types` only widens by `"video"` |
| Pending permissions | `permission.list` | `GET /api/session/{sessionID}/permission` | Session-scoped array |
| Permission decision | `permission.reply` | `POST /api/session/{sessionID}/permission/{requestID}/reply` body `{ decision, message? }` | `decision` is `once`, `always`, or `reject`; 204 |
| Pending forms | `session.form.list` | `GET /api/session/{sessionID}/form` | Session-scoped array |
| Form answer | `session.form.reply` | `POST /api/session/{sessionID}/form/{formID}/reply` body `{ answer }` | 204 |
| Form cancel | `session.form.cancel` | `DELETE /api/session/{sessionID}/form/{formID}?message=…` | 204 |
| Send prompt | `session.prompt` | `POST /api/session/{sessionID}/prompt` body `{ id, text, … }` | See section 5 |
| Interrupt | `session.interrupt` | `POST /api/session/{sessionID}/interrupt` | Response `{ interrupted: boolean }`; no `data` wrapper |
| Switch agent | `session.switchAgent` | `POST /api/session/{sessionID}/agent` body `{ agent }` | 204 |
| Switch model | `session.switchModel` | `POST /api/session/{sessionID}/model` body `{ model }` | 204 |

Response wrappers matter: `session.list` and `message.list` return their page as
`{ data, cursor }`, while agent/model lists remain `{ location, data }`.
`session.create`/`get`, the active-session map, permission list, form list, and
prompt calls unwrap `.data`. `session.interrupt` is not wrapped, and the plugin
correctly reads `result.interrupted`.

`api-contract.ts` now wraps the generated client and validates the fields the
plugin reads. The validators accept extra fields and forward unknown event
types. That is compatible with the observed additive changes. It is not a
substitute for the live acceptance run.

## 3. Directory encoding

- Session listing sends `directory` as a query parameter.
- Session creation sends `location.directory` in the JSON body.
- Agent/model listing sends a nested `location` object; the generated client
  serialises it as `location[directory]=…`.
- Server `requestRef()` is unchanged since 2.2.2. It reads
  `location[directory]` from the query string first, then
  `x-opencode-directory`, then falls back to `process.cwd()`.
- Session-scoped routes resolve their location from the session row, not from
  the request directory.

OpenChamber's `x-opencode-directory` header is therefore an additional routing
mechanism, not a requirement introduced in 2.3.x. The generated client's
query/body form is sufficient for every call this plugin makes. If the header is
ever adopted, it must be URL-encoded like OpenChamber does and must not replace
an explicit location for location-scoped calls; otherwise the server's `cwd`
fallback can select the wrong location.

Windows path nuance: `Session.create` canonicalises the submitted directory with
`LocationServiceMap.canonical()` (`path.win32.normalize` on Windows unless the
path starts with `/`), then `session.list` compares the stored directory with
SQL equality. The plugin currently passes `FileSystemAdapter.getBasePath()`
unchanged after validation. If Obsidian ever supplies a spelling (separators,
trailing separator, or drive-letter case) that differs from the canonical stored
value, the list query can miss sessions even though `sameDirectory()` would
consider them equal. This is a behavioural risk in the current implementation,
not evidence of a 2.2.2/2.3.2 incompatibility. Sending one canonical spelling for
both create and list, or reusing the server-returned location string, avoids it.

## 4. Pending permissions and forms

Both 2.2.2 and 2.3.2 expose two families of pending lists:

| Scope | Permission | Form | Return shape |
| --- | --- | --- | --- |
| Session | `GET /api/session/{sessionID}/permission` | `GET /api/session/{sessionID}/form` | Generated client unwraps `.data` to an array |
| Location | `GET /api/permission/request?location[directory]=…` | `GET /api/form?location[directory]=…` | Location-scoped `{ location, data }` wrapper; generated client does not unwrap |

OpenChamber uses the location-scoped calls. Their existence and use do not
prove that the session-scoped endpoints were removed or deprecated; both
families are present, unchanged, in 2.2.2 and 2.3.2. The session-scoped lists
are the safer fit for this plugin because they cannot include another session in
the same vault, and they match the decision endpoints (`requestID` and `formID`
are owned by the session). Switching to location scope would require unwrapping
the response and filtering by `sessionID`.

Permission decisions and form answers use the same field and value contracts in
both versions. `Permission.Reply` remains `once | always | reject`. `Form.Answer`
remains a record of string, number, boolean, or string-array values. The six
supported field types are unchanged: string, number, integer, boolean,
multiselect, external.

`permission.asked`, `permission.replied`, `form.created`, `form.replied`, and
`form.cancelled` are all ephemeral events. They are not replayed after a
disconnect. The plugin's snapshot-first recovery and pending-list refresh remain
required; this did not change in 2.3.2.

## 5. Prompt identity

The wire contract is identical in 2.2.2 and 2.3.2, and it imposes a format:

- `POST /api/session/{sessionID}/prompt` declares `id` as `SessionMessage.ID`
  (optional).
- `SessionMessage.ID` is a branded string that must start with `msg_`
  (`packages/schema/src/session-message.ts`).
- The ID schema is identical in 2.2.2 and 2.3.2. A local decode with the
  installed `@opencode/schema` 2.2.2 produced `REJECTED` for a bare UUID (the
  current `createPromptID()` result) and `ACCEPTED` for the same value prefixed
  with `msg_`.
- The server uses `input.id ?? SessionMessage.ID.create()`. It first calls the
  inbox `reconcile` for that id. Retrying the same admitted id returns the
  existing inbox item; it does not duplicate the prompt. A lifecycle conflict is
  a 409 `ConflictError`; a non-`msg_` id is a 400 schema rejection.
- The success body is `SessionInbox.User`:
  `{ id, sessionID, time, type: 'user', payload: { text, … }, delivery }`.
  The id is the submitted id, which is why identity-based reconciliation works.
- The generated response validator does not change this contract.

**Finding at review time:** `src/state/prompt-coordinator.ts` generated a bare UUID
(or a UUID-shaped fallback) and sends it as `id`. Against a real service this
fails schema decoding before admission, in both 2.2.2 and 2.3.2. The prompt
tests use synthetic ids such as `prompt-1` and a mocked client, so they do not
detect it. This is independent of the runtime version range and of the client
pin. The fix is to generate a `msg_`-prefixed identity and preserve it across
reconciliation/retry. Matching the server's ascending identifier convention is
preferable to a random suffix, though the schema only enforces the prefix.
The implementation now prefixes both randomUUID and fallback identities with
`msg_`; default-generator and UI-send regression tests cover that correction.
Further source review confirmed that transcripts and inbox items are ordered
by durable sequence, not message ID. A UUID suffix does not reorder messages.

Live reopening also exposed a caller error: `message.list` rejects combining
`cursor` with `order`. A cursor already encodes its order and direction. The
plugin now supplies `order: 'asc'` only on the first page, follows every opaque
next cursor without `order`, and preserves normal terminal-page handling.
`InvalidCursorError` is not treated as end-of-list. The guard and behavior are
identical in 2.2.2 and 2.3.2; this is not a reason to narrow version eligibility.

A second, lower-risk nuance: the acknowledgment check also requires
`payload.text` to equal the submitted text. Server prompt hooks may rewrite
prompt text before admission. If a hook does so, an admitted prompt would be
classified as uncertain. It remains recoverable, but the equality check is
stricter than the identity contract.

## 6. Events and ordering

Event transport and framing are identical between 2.2.2 and 2.3.2:

- Each subscription starts with a synthetic `server.connected` frame, then the
  live feed. Heartbeats are SSE comments every 15 seconds.
- There is no replay or resume. A slow consumer's queue is dropping, capacity
  4,096; overflow terminates that subscriber's stream.
- The generated client parses any JSON `data:` frame without a type whitelist.
  The pinned 2.2.2 client therefore forwards 2.3.2 events it does not know,
  including `session.step.first-token`.
- Durable session events carry `durable: { aggregateID, seq, version }`, keyed
  by session ID. Sequence order is the authoritative order for durable events.
  Ephemeral deltas and interaction events rely on arrival order and snapshot
  recovery.
- `EventIngestion` checks durable sequence monotonicity, tolerates gaps, and
  discards the projection on unsupported mutation. That remains appropriate.

`session.step.first-token`:

- Introduced in the 2.3.0 schema, absent from 2.2.2, 2.2.3, 2.2.4, and 2.2.5.
- Durable, emitted once per step after `session.step.started` and before the
  first `text.started`, `reasoning.started`, or tool input event.
- Carries only `sessionID` and `assistantMessageID`; no text, cost, or completion
  outcome. It must not complete a message.
- 2.3.2 also exposes the optional assistant-message `time.firstToken`,
  introduced in 2.3.0. The plugin does not need it for correctness.
- The reducer special-cases the event as a timing-only milestone without forcing
  a snapshot on every answer. `api-shapes.ts` validates its two fields.
- If the referenced assistant message is not yet known, the reducer treats the
  projection as uncertain and recovers. That is safe, though a snapshot-first
  pass with an in-flight message may occasionally need another pass.

Other additive events:

- `persistent-pty.updated` (introduced 2.2.4) is ephemeral and carries
  `sessionID`. Since the reducer has no case for it, a relevant update causes a
  full resync. This only occurs if the selected conversation has a persistent
  terminal updated by another client, but it is a real behaviour difference from
  2.2.2.
- `artifact.updated` (2.2.4) carries no session identity in its data and is not
  relevant to a conversation.
- `experimental.mcp.event` (2.3.2) carries no session identity.

No ordering, heartbeat, or overflow change was found.

## 7. Meaningful differences, 2.2.2 to 2.3.2

Changes that do not affect the used contract:

- Video generation, blob, automation/artifacts/job APIs, replacing the
  experimental schedule API.
- `ModelType` adds `video`; `ModelListInput.types` accepts it.
- `session.generate` now returns `tokens` and `cost` in addition to `text`.
  The plugin does not use this endpoint.
- New `persistent-pty.updated` and `artifact.updated` event types (2.2.4) and
  `experimental.mcp.event` (2.3.2).
- `session.step.first-token` and `time.firstToken` (2.3.0).
- `agent.list` in 2.2.2 through 2.2.5 awaits location plugin activation for up
  to five seconds and can answer 503; 2.3.0 removed that wait. A 503 is a
  recoverable options-loading error for this plugin, not API incompatibility.

Changes to the reviewed contract: none for registration, authentication,
session list/create/get, message list, active sessions, agent/model list,
prompt identity, permission lists/replies, form lists/replies/cancels, or
interrupt/agent/model switching.

## 8. Why OpenChamber requires 2.2.4

The reviewed OpenChamber snapshot sets `MINIMUM_OPENCODE_VERSION = '2.2.4'`.
Upstream history explains why:

- Commit `44be19f557e4f1e87a129092cc6a8fa72b1efb66`
  (`chore(opencode): bump OpenCode to 2.2.5 ...`) states that OpenCode 2.2.4
  accepts `compaction.buffer` as a share such as `"20%"`, while an older release
  rejects the whole config file containing it. OpenChamber's Settings writes that
  form, so it raised its own minimum to 2.2.4.
- The same commit's compatibility test accepts `2.2.4`, `2.2.5`, `2.3.0`, and a
  `2.2.4-beta.1` string. Its prerelease handling is its own policy.

This is not a registration, authentication, session, message, prompt, event,
permission, or form requirement. This plugin never writes OpenCode
configuration, so the reason for OpenChamber's 2.2.4 floor does not apply.
Comparing the used server/protocol files at `v2.2.2` and `v2.2.4` found no
relevant change; the only `routes.ts` difference was additional KV wiring.

There is therefore no evidence that requires narrowing the provisional target
to 2.2.4, and copying OpenChamber's floor would discard support for 2.2.2 and
2.2.3 for an unrelated feature.

## 9. Recommendation: client pin

**Keep `@opencode/client` pinned to 2.2.2 for this change.**

Reasons:

- Every endpoint, payload, response shape, and event used by the plugin is
  unchanged through 2.3.2. The 2.2.2 client already forwards the additive
  events, and the reducer/validator handle `session.step.first-token`
  explicitly.
- 2.2.2 is the package that has actually been bundled and exercised in the
  recorded transport probe. A pin change would invalidate that evidence and
  require a fresh bundle and Electron gate for no functional gain.
- The runtime eligibility range is a service-version policy, not a requirement
  that the client package version equal the service version.
- Bumping to 2.3.2 would add media/video surface and a newer optional `effect`
  peer, with no additional call needed by this plugin.

If a later change wants compile-time typing for `session.step.first-token` and
the newer event names, bump to exactly 2.3.2 and rerun the import/bundle test,
the production Electron discovery/authentication/streaming gate, and the
regression suite. Do not use a floating range or infer compatibility from the
package version alone.

## 10. Recommendation: runtime eligibility

The evidence supports the provisional `>=2.2.2 <3.0.0` target, subject to live
verification:

- Accept stable SemVer `2.x` releases only, from `2.2.2` inclusive to `3.0.0`
  exclusive.
- Accept valid build metadata, for example `2.2.2+build.7`; it does not change
  eligibility.
- Reject prereleases and release candidates for this policy, because no
  prerelease contract was reviewed. This matches the existing
  `tests/compatibility.test.mjs` expectations.
- Reject prefixes, whitespace, leading-zero components, non-string values, and
  numeric overflow.
- Document `2.2.2` and `2.3.2` as the individually source-compared releases; the
  rest of the range is eligibility, not tested coverage.
- Version rejection stays separate from API incompatibility. A 503, timeout, or
  malformed response is not evidence that the service version is ineligible.

This is a policy recommendation, not a live acceptance claim. It is based on
source and package comparison across the range, not on a 2.3.2 service running
in Obsidian.

## 11. Follow-ups before task 1.3 can be completed

1. Fix the prompt identity prefix and add a contract-level test that sends a real
   `msg_` id through a schema-compatible fake or live service. Do not run a real
   prompt merely to discover this.
2. Re-run the production Electron discovery/authentication/streaming gate and
   the full conversation workflow against an already-running 2.2.2 and 2.3.2
   service. A successful host-Node probe is not Electron acceptance.
3. Verify the chosen client pin against those services, including the first-token
   event and reconnect/snapshot behaviour under 2.3.2.
4. Decide how to treat `persistent-pty.updated` on the selected session. If
   another client updates a terminal during a conversation, the current reducer
   resyncs on every update.
5. Resolve the canonical Windows directory spelling used for `session.create`
   and `session.list`, or record why `getBasePath()` is guaranteed to match the
   stored value.
6. Keep documentation explicit about eligible versions versus individually
   tested releases, and do not describe source comparison as a live result.

## 12. Evidence limitations

- No OpenCode service was started, stopped, replaced, or reconfigured.
- No prompt, permission decision, or form answer was sent.
- No Electron or in-Obsidian acceptance run was performed for this review.
- No 2.3.2 service was running; the earlier host-Node probe observed 2.2.5.
- Server behaviour is inferred from upstream tagged source and from the published
  client package, not from the user's installed binary. `@opencode/client`
  versions do not have to equal service versions.
- Only the conversion and event paths used by this plugin were reviewed. Other
  endpoints, provider flows, MCP, PTY, media, automation, artifacts, and UI
  behaviour are out of scope.
- Patch releases across the range were checked for the used protocol and server
  handler files, but not exhaustively for every dependency or internal service.
- The working tree was being changed during this review. Statements about
  plugin behaviour refer to the implementation present at review time; the
  prompt-identity finding applies to the reviewed `prompt-coordinator.ts` and
  its tests.
- Source/type equality does not prove runtime behaviour. Response validation,
  authentication, cancellation, streaming, and error translation still require
  the documented live gates.

## References

- OpenCode V2 client documentation: https://opencode.ai/v2/docs/build/client
- OpenCode V2 troubleshooting and service files: https://opencode.ai/v2/docs/troubleshooting/
- Published client 2.2.2 types: https://unpkg.com/@opencode/client@2.2.2/dist/promise/generated/types.d.ts
- Published client 2.3.2 types: https://unpkg.com/@opencode/client@2.3.2/dist/promise/generated/types.d.ts
- Registration/service types: https://unpkg.com/@opencode/client@2.2.2/dist/service.d.ts
- Service probe implementation: https://unpkg.com/@opencode/client@2.2.2/dist/chunks/pty-handoff-8ye1ye6f.js
- OpenCode `v2.2.2` server source: https://github.com/anomalyco/opencode/tree/v2.2.2/packages/server/src
- OpenCode `v2.3.2` server source: https://github.com/anomalyco/opencode/tree/v2.3.2/packages/server/src
- Prompt route contract: https://github.com/anomalyco/opencode/blob/v2.3.2/packages/protocol/src/groups/session.ts
- `SessionMessage.ID` prefix: https://github.com/anomalyco/opencode/blob/v2.3.2/packages/schema/src/session-message.ts
- Directory resolution: https://github.com/anomalyco/opencode/blob/v2.3.2/packages/server/src/location.ts
- Event feed: https://github.com/anomalyco/opencode/blob/v2.3.2/packages/server/src/event-feed.ts
- First-token publication: https://github.com/anomalyco/opencode/blob/v2.3.2/packages/core/src/session/runner/publish-llm-event.ts
- OpenChamber compatibility source: https://github.com/openchamber/openchamber/blob/30c70496a5ca0105e04e60a783964576973edc8f/packages/web/server/lib/opencode/compatibility.ts
- OpenChamber minimum-version rationale: https://github.com/openchamber/openchamber/commit/44be19f557e4f1e87a129092cc6a8fa72b1efb66
