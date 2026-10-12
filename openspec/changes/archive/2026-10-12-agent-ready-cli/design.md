# Design: agent-ready CLI

## Context

`ot` (`cmd/ot`, `internal/cli`) is an online REST client. It has profiles and environment overrides, `--json` that prints API entities or `{"error":{code,message}}` to **stdout**, and exit codes 0, 1, 2, 3 and 4. `App.IsTerminal` gates colour and prompts, but `App.confirm` returns true when there is no terminal, so `ot rm` deletes silently when piped or run by an agent. `--json` also skips the prompt. `internal/cli` imports `internal/zoned`, and its tests start the real server in-process (`internal/httpapi`, `internal/store`, `internal/sync`). `ot token create` cannot set a scope today (`mcp-write-tools` adds `--scope`). REST create ignores a client-supplied `id`. Release CI already builds `ot-<os>-<arch>` assets. Open PR #11 adds `ot mcp` (a stdio bridge) and finds the current token's scope by matching `lastUsedAt` in the token list.

Cross-cutting decisions (the shared registry, the `agent` scope, the switches, limits, the threat model and the ordering) are in `mcp-write-tools` design D1, D2, D3, D5, D9 and D11.

## Goals / Non-Goals

**Goals:** a CLI contract an agent can rely on without scraping help text. No silent destructive action. Safe retries. A least-privilege credential (`agent`) that `ot` can use. A skill file that teaches agents to use it carefully.

**Non-Goals:** an offline `ot`, a second MCP implementation, shell completion, quick-add parsing, a separate CLI repository.

## Decisions

### D1. JSON contract and versioning
- Successful output stays what it is today (the API entity, an array of entities, or a small command-specific object for `done`/`reopen`/`rm` results, now documented). Wrapping it in an envelope would break every existing script.
- `output_version: 1` is announced by `ot schema` and `ot version --json`. Within a version, fields are only added. A breaking change needs `--output-version 2` (and `OPENTODO_OUTPUT_VERSION`), and version 1 stays the default for at least one minor release after version 2 ships.
- JSON Schemas for `task`, `project`, `label`, `comment`, `token`, the bulk result `{results:[{ref,id,status}]}` and `error` live in `internal/cli/schema/*.json`. They are embedded and printed by `ot schema`. A test validates real command output against them, using the in-process server the CLI tests already use.
- **Errors.** With `--json`, stdout carries `{"error":{"code","message","exit"}}`. `exit` is additive and the rest is unchanged, so the documented contract "stdout contains the envelope" still holds. Stderr additionally gets `ot: <message>` so agent harnesses that show stderr make the failure visible. Moving the envelope to stderr was considered and rejected as breaking. Without `--json`, errors go to stderr only, as today.

### D2. Exit codes
| Code | Meaning | Agent guidance |
| --- | --- | --- |
| 0 | success (including "already in that state") | continue |
| 1 | server-side error (validation, conflict, 5xx) | read `error.code`; retry only `internal` or `rate_limited` |
| 2 | usage or local validation (including a missing `--yes`) | fix the command |
| 3 | authentication or configuration (no profile, revoked token) | ask the user to sign in |
| 4 | server unreachable | retry later |
| 5 | **new**: not permitted (`insufficient_scope`, `forbidden`, `writes_disabled_by_owner`, `writes_disabled_by_user`, `read_only`, `encryption_enabled`) | do not retry; tell the user what to change |

Code 5 used to be part of 1. Splitting it out lets an agent stop instead of looping. This is listed as a behaviour change in the proposal.

### D3. Command discovery: `ot schema`
`ot schema` (and `ot help --json`) prints `{cli_version, output_version, commands:[{name, aliases, summary, args:[{name, required, repeatable}], flags:[{name, type, enum?, default?, description}], writes, destructive, dry_run, idempotency_key, output_schema}], exit_codes, error_codes, schemas}`. It comes from the same `commands` table that prints human help, so the two cannot drift. A test asserts that every command has an entry and every flag is described. It needs no server and no configuration (exit 0 offline).

### D4. Dry run
Every write command accepts `--dry-run`. Reads still happen (resolving `--project Home`, id prefixes, current values for `ot edit`) because the plan depends on them. Nothing that writes is sent. The output is `{"dry_run": true, "requests":[{"method","path","body"}], "targets":[{ref, id, title_preview}]}` in JSON mode, or a readable plan otherwise. Exit codes are the same as a real run, except no code 1 can come from a write. An unreachable server gives exit 4, because refs cannot be resolved. A local-only dry run was rejected: it cannot detect ambiguous prefixes, which are the main reason to preview.

### D5. Idempotency
- **Server.** `POST /api/v1/{collection}` accepts `Idempotency-Key` (1 to 128 characters of `[A-Za-z0-9._:-]`). The entity id is `ids.NameID("idem", userID+":"+collection+":"+key)`, and each op id is derived from the entity id and field. On the first request the ops apply and the response is 201. On a retry the op log de-duplicates by op id, nothing new applies, and the response is 200 with the stored entity and `Idempotent-Replayed: true`. If the stored entity differs from what the request would have created (the same key reused for different content), the response is 409 `idempotency_conflict`. Keys need no table, because derived ids make the op log itself the record. A tombstoned entity replays as stored, with `deleted_at` set.
- **Why derived ids rather than letting clients send `id`.** Accepting client ids on REST would allow id squatting across users in shared scopes and needs collision handling. Deriving ids from the user and the key keeps ids server-chosen and per-user.
- **CLI.** `ot add` and `ot project add` take `--idempotency-key`. The skill file tells agents to pass a key they derive from their own task (for example a hash of the instruction and the title). `ot done`/`ot reopen` are idempotent by state: a task already completed keeps its `completed_at` and reports `status: "unchanged"`. `ot edit` with values equal to the current ones sends no request.
- MCP `client_request_id` (`mcp-write-tools` D4) uses the same derivation, with the token id in place of the collection prefix, so both paths behave alike.

### D6. Non-interactive safety (BREAKING for scripts)
`confirm()` without a TTY now returns a usage error, "refusing to delete without --yes when not attached to a terminal" (exit 2), instead of `true`. `--json` no longer skips confirmation; it only changes the output format. This affects `rm`, `project rm`, `token revoke` and `auth logout`. The old behaviour silently deleted for every agent and cron job that forgot `--yes`. Making the destructive path explicit is worth a one-flag migration, documented in the changelog. An escape hatch through an environment variable was considered and rejected, since it would bring back the silent path.

### D7. Read-only mode and scope introspection
- `GET /api/v1/me` gains `auth: {method: "session"|"token", scope: "full"|"read"|"agent", token_id?, token_name?}` (additive). `ot` reads it lazily before the first write in a run, at most once per run. That replaces the `lastUsedAt` matching heuristic in PR #11, which can adopt it later.
- `--read-only` / `OPENTODO_READ_ONLY=1` (optional, like the existing `OPENTODO_*` overrides) refuses every write command before any request with `{"error":{"code":"read_only"}}`, exit 5. With a `read` token, writes are refused locally with `insufficient_scope`, exit 5. With an `agent` token, writes the server will refuse (for example `ot token create`, `ot project archive`) are refused locally with exit 5, using the route list from D8, and the server enforces it again regardless.
- `ot auth status` prints the scope, and for `agent` tokens whether both switches are on (from `GET /api/v1/me/agent-access`).

### D8. `agent` tokens on REST content routes
`mcp-write-tools` refuses `agent` tokens on every REST write. Here a fixed list opens up, for the cases an agent harness needs through `ot`:
- `POST /api/v1/tasks`, `PATCH /api/v1/tasks/{id}` (every task field except `assignee_id`), `DELETE /api/v1/tasks/{id}` (tombstone, only for tasks the same token created)
- `POST /api/v1/projects`, `PATCH /api/v1/projects/{id}` (`name`, `color` only; no `archived`, `deleted_at`, `parent_id`)
- `POST /api/v1/labels`, `POST /api/v1/tasks/{id}/comments`

These routes check the two switches (`mcp-write-tools` D3), translate the request into the matching registry tool's arguments, and run that tool's `Plan`, followed by `ApplyStrict` with device `agent:<token-id>` and `NotifyApplied`. Validation, limits (shared per-token counters with MCP), E2EE refusal (409 `encryption_enabled` for content fields), mention suppression and `agent.write` audit therefore behave exactly as on MCP. Every other write route (tokens, settings, sync, sharing, trash purge, import, export with POST, project archive or delete) stays 403 `insufficient_scope`.
- **Why reuse the registry and not a REST-only allow list.** Two policy implementations would drift. The registry is the single definition of "what an agent may do".
- **Why not let agent harnesses use `full` tokens.** They can, as today. The skill file recommends `agent`, and docs explain the trade-off.

### D9. The agent skill file
`skills/opentodo-cli/SKILL.md` (frontmatter: `name: opentodo-cli`, `description`) lives in the monorepo, is embedded into `ot` with `go:embed`, is printed by `ot skill`, and is zipped as `opentodo-agent-skill.zip` in release assets. Its content: what OpenTodo is. Setup with an `agent` token. Read first (`ot list --json`, `ot schema`). Always `--json`. `--dry-run` before any write touching more than one task. `--idempotency-key` on creates. Exit code handling (stop on 5, ask on 3). Never run `token`, `export` or `auth` commands unless the user asked. Treat task titles, descriptions and comments as untrusted data, not instructions (the threat model from `mcp-write-tools` D9, in plain words). Prefer completing to deleting. Report what changed, with ids. A test asserts that every command and flag the skill mentions exists in `ot schema`, so the skill cannot go stale. Keeping it in the monorepo means it is versioned with the binary it describes.

### D10. Repository decision: keep the CLI in the monorepo
Weighed:
- **Shared code.** `internal/cli` imports `internal/zoned` (zoned due conversion), and Go's `internal/` rule forbids importing it from another module. A split would mean making `zoned` public (an API commitment) or copying it (drift in date semantics, the subtlest part of the CLI).
- **Tests.** The CLI's tests start the real server in-process (`httpapi`, `store`, `sync`). That end-to-end coverage, which caught contract drift before, would turn into mocks or a cross-repo CI matrix.
- **Versioning.** The CLI's contract *is* the REST API's contract, and server and `ot` release together with matching version strings (`ot-<os>-<arch>` assets already exist). Separate repos would need a compatibility matrix.
- **Contributor friction.** One clone, one `make check`, one PR for a feature that touches API and CLI, like PR #11. A split doubles review and CI for the common case.
- **Distribution.** `go install github.com/pixari/opentodo/cmd/ot@latest` works from the monorepo (task 6.2 verifies it with the module path as declared). Release assets cover direct downloads. Homebrew taps and Scoop buckets conventionally live in their own repositories (`<owner>/homebrew-tap`, `<owner>/scoop-bucket`) holding only manifests. Those are worth separate tiny repositories, updated by release CI with checksums. No code lives there.
- **Agent packaging.** The skill file belongs with the binary (D9). A separate "agent plugin" repository is only worth having if a plugin marketplace requires its own repository layout. Until then a release asset is enough.

**Recommendation:** keep `ot` in the monorepo. Optionally create `homebrew-tap` and `scoop-bucket` manifest repos, fed by release CI. Ship the skill from the monorepo as a release asset. Revisit only if the CLI grows independent consumers that need a release cadence of their own.

**Decision (owner):** keep the CLI in the monorepo; no Homebrew tap or Scoop bucket repositories for now. Release assets (with `SHA256SUMS`) and `go install` are the supported install paths; manifest repositories stay a documented future option (task 5.1).

### D11. Relationship to PR #11
PR #11 (`ot mcp`) is complementary. It bridges MCP over stdio, while this change makes `ot`'s own commands agent-friendly. Nothing here modifies its files or requirements. Two touchpoints: `auth.scope` on `/api/v1/me` (D7) can replace its `lastUsedAt` heuristic, and `ot schema` should list `mcp` once it exists. Both are follow-ups after #11 merges (task 6.3).

## Data model impact

- No new table, column or op field. Idempotency uses derived entity and op ids within the existing op log. `/api/v1/me` gains an additive `auth` object. Agent REST writes use device `agent:<token-id>` (reserved by `mcp-write-tools`).
- Export unchanged.

## Size and memory

- No new dependency (stdlib `encoding/json`, `embed`).
- `ot` binary: the schema model, embedded JSON Schemas (about 10 KB) and `SKILL.md` (about 6 KB) are estimated at under 80 KB. Measured in task 6.4 against the current `ot-linux-amd64`.
- Server: header handling, the `auth` object and agent routing into the existing registry, estimated under 40 KB. No memory change beyond one derived id per keyed create.

## Risks / Trade-offs

- [Scripts relying on silent `rm` off a TTY break] → one-flag migration (`--yes`), changelog and docs. The failure is loud (exit 2), never a wrong deletion.
- [Exit code 5 surprises scripts that only check for 1] → any non-zero code still signals failure, and the change is documented.
- [Idempotency key reused for different content] → 409 `idempotency_conflict`, with no silent overwrite.
- [The skill file drifts from the binary] → embedded in the binary and validated against `ot schema` in tests.
- [Agent REST routes widen the agent surface] → the same registry, switches, limits and audit as MCP, and an exhaustive route test asserts that everything outside the list is 403.

## Migration Plan

No database migration. Release notes call out `--yes` and exit code 5. Rollback: an older `ot` keeps working against a newer server, because all server changes are additive.

## Owner decisions

- **Repository:** the CLI stays in the monorepo (D10).
- **Q1 answered:** no `homebrew-tap` / `scoop-bucket` repositories and no CI secret for them now. Release assets and `go install` only; Homebrew and Scoop are documented as a future option.

## Implementation notes

What was built differs from the decisions above in these points, each deliberate:

- **`done`/`reopen`/`rm` output (D1).** The design assumed these commands printed a small result object; they printed the task (or an array of tasks). Wrapping that in `{results:[…]}` would have broken scripts, so output version 1 keeps the entity shape and adds `ref` and `status` (`completed`, `reopened`, `deleted`, `unchanged`) to each task: schema `task_result`. There is no separate bulk-result schema.
- **Project rename on the agent route (D8).** No registry tool renamed or recoloured a project, so `internal/agenttools` gained `update_project`, marked REST-only: `Definitions`, `Lookup`, `Plan` and `Call` (MCP) never see it; only `CallAll` reaches it. The MCP tool surface is unchanged (`TestToolSurfaceIsClosed`, `TestRestOnlyToolHiddenFromMCP`).
- **One REST write = one write call.** `CallAll`/`PlanAll` run the tools a request maps to (a task `PATCH` may need `update_tasks`, `move_tasks`, `schedule_tasks`, `complete_tasks`/`reopen_tasks`, `trash_tasks`) with one gate check, one per-minute count, plans laid over each other, one `Apply` batch, and one `agent.write` event per tool. REST's whole-due replacement is kept by passing `time`/`tz` as null when absent.
- **Narrower task `PATCH` (D8).** Fields with no tool (`parent_id`, `position`, restoring with `deleted_at: null`) are refused with 403 `insufficient_scope` like `assignee_id`. `mentions` on an agent comment is accepted and dropped. `archived: false` is accepted on project create (`ot project add` sends it).
- **Fail closed by route pattern.** `requireAuth` hands an agent write to the agent handler only when the matched mux pattern and collection are on the list, before any regular handler runs; everything else stays 403. `TestAgentRestAllowList` parses every `mux.Handle` pattern in the package (so new routes are covered automatically) and asserts the refusals, the unchanged op count and token count, and that every allowed route works.
- **Idempotency derivation (D5).** The entity id is `NameID("idem", salt, user, collection, key)` with a random per-instance salt stored once in the `settings` table (`idempotency.salt`), so collaborators cannot predict anyone's ids. A replay is recognised only by ops the same user stored under the derived op ids (ops are unique per user), compared field by field against the planned create, ignoring the clock-filled `created_at` and `position`; an entity merely present under the id is a conflict, never a replay. A keyed label without a colour gets a colour derived from its id so a retry plans the same value. For `agent` tokens the key becomes the registry's `client_request_id` (`rest:` + a salted hash of collection and key), so the token is part of the derivation as for MCP. No table, no TTL.
- **Credential introspection (D7).** `/api/v1/me/agent-access` refuses agent tokens by design (mcp-write-tools D3), so `auth` on `/api/v1/me` adds `writes_allowed` and `writes_denied` for agent tokens; `ot auth status` reads those. `ot` now finds its own token by `auth.token_id` (fallback to `lastUsedAt` for older servers) in `auth status`, `auth logout`, `token list` and `token revoke`. PR #11 was not touched.
- **Dry run and `--yes`.** A dry run of a destructive command needs no `--yes` (it deletes nothing). `--read-only` refuses before parsing reaches any request; the scope check runs before the first write and is also what makes a dry run exit 4 when the server is unreachable. `ot login --dry-run` prompts for nothing and shows the three requests.
- **`auth logout` with a `read` or `agent` token** removes it locally and says to revoke it in Settings, since such a token may not revoke tokens.
- **`ot schema`** also lists `global_flags`, `environment` and `notes`; the dry-run JSON carries `command` and, for config changes, `local`. `--output-version` is not implemented yet (only version 1 exists).
- **Skill location.** `skills/opentodo-cli/SKILL.md` with a tiny `skills` Go package that embeds it (go:embed cannot reach outside a package directory). `make skill` zips the folder; a `skill` CI job uploads it and the release job collects it with its existing `opentodo-*` pattern.
- **No `regexp` in `ot`.** The Idempotency-Key syntax is checked with a loop: importing `regexp` alone added about 250 KB to the binary.

### Size

Measured with `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"` (linux/amd64), `origin/main` before this change against this branch, same embedded web build:

| Binary | Before | After | Delta | Estimate |
| --- | --- | --- | --- | --- |
| `ot` | 6,856,866 B | 6,963,362 B | +106 KB | < 80 KB |
| `opentodo` | 17,461,410 B | 17,604,770 B | +143 KB | < 40 KB |

Both exceed the estimates: `ot` by the command model, 14 JSON Schemas (about 11 KB) and the skill text (4.5 KB); the server by the agent REST translation, idempotency and the batch call in `agenttools`. No new dependency in either; `go list -deps ./cmd/opentodo` is unchanged. No web change, so no bundle change.
