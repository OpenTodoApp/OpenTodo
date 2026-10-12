# Tasks

Depends on `mcp-write-tools` (the `agent` scope, the switches, `internal/agenttools`) being applied first.

## 1. Server

- [ ] 1.1 `Idempotency-Key` on `POST /api/v1/{collection}`: validation, derived entity and op ids, 201/200 replay with `Idempotent-Replayed`, 409 `idempotency_conflict`. Verify `TestIdempotentCreateReplay`, `TestIdempotentCreateConflict`, `TestIdempotencyKeyInvalid400`, `TestIdempotentCreateConvergesAcrossDevices` with `go test ./...`
- [ ] 1.2 `auth` object on `GET /api/v1/me` (method, scope, token id and name, never the secret). Verify `TestMeAuthIntrospection` (session, full, read, agent, revoked gives 401) with `go test ./...`
- [ ] 1.3 Agent content routes: route `agent` tokens on the listed routes through the matching registry tool (gate, `Plan`, `ApplyStrict` with device `agent:<token-id>`, `NotifyApplied`, shared limits, `agent.write`, E2EE 409, mention suppression). Every other write stays 403. Verify `TestAgentRestAllowList` (exhaustive over registered routes), `TestAgentRestSwitchOff`, `TestAgentRestEncrypted409`, `TestAgentRestSharesLimitsWithMcp` with `go test ./...`

## 2. CLI contract

- [ ] 2.1 JSON Schemas for task, project, label, comment, token, bulk result and error in `internal/cli/schema/`, embedded. Validate real outputs against them through the in-process server. Verify `TestOutputsMatchSchemas` with `go test ./...`
- [ ] 2.2 Error envelope gains `exit`, a stderr human line in JSON mode, exit code 5 for `insufficient_scope`, `forbidden`, `writes_disabled_*`, `read_only` and `encryption_enabled`. Verify `TestExitCodeTable` and `TestJsonErrorStdoutAndStderr` with `go test ./...`
- [ ] 2.3 `ot schema` / `ot help --json` generated from the `commands` table, working offline. Verify `TestSchemaCoversEveryCommandAndFlag` and `TestSchemaWorksWithoutConfig` with `go test ./...`
- [ ] 2.4 `ot version --json` reports `output_version: 1`. Verify `TestVersionJson` with `go test ./...`

## 3. Safety and idempotency in commands

- [ ] 3.1 `confirm()` without a TTY, or with `--json`, refuses without `--yes` for `rm`, `project rm`, `token revoke`, `auth logout`. Verify `TestDestructiveRequiresYesOffTerminal` (exit 2, no request sent, checked with the in-process server's request log) with `go test ./...`
- [ ] 3.2 `--dry-run` on every write command (reads allowed, no write sent, planned requests printed). Verify `TestDryRunSendsNoWrites` over all write commands, with the in-process server asserting that no non-GET request arrives, using `go test ./...`
- [ ] 3.3 `--idempotency-key` on `add` and `project add`, `unchanged` status for `done`/`reopen` on tasks already in that state, and no request for no-op `edit`. Verify `TestAddIdempotencyKey`, `TestDoneAlreadyCompletedUnchanged`, `TestEditNoopSendsNothing` with `go test ./...`
- [ ] 3.4 `--read-only` and `OPENTODO_READ_ONLY`, local refusal for `read` tokens and for `agent` tokens on routes outside the list (scope from `/api/v1/me`, fetched at most once per run), and `ot auth status` showing scope and switch state. Verify `TestReadOnlyMode`, `TestReadTokenRefusedLocally`, `TestAuthStatusShowsScope` with `go test ./...`

## 4. Agent skill

- [ ] 4.1 Write `skills/opentodo-cli/SKILL.md` (frontmatter, setup with an `agent` token, read-first workflow, `--json`, `--dry-run`, idempotency keys, exit code handling, untrusted-text rule, commands to avoid), embed it, and add `ot skill`. Verify `TestSkillMentionsOnlyExistingCommands` (parses commands and flags from the skill and checks them against `ot schema`) with `go test ./...`
- [ ] 4.2 Release CI: zip the skill as `opentodo-agent-skill.zip` next to `ot-<os>-<arch>`. Verify with a dry run of the release job (`act` or a tagged pre-release on a fork) that lists the asset

## 5. Distribution (optional, pending the open question)

- [ ] 5.1 Generate a Homebrew formula and a Scoop manifest with checksums from release assets in CI, and push them only when the target repositories and secret exist. Verify the generated files with `brew audit --formula` (or `ruby -c`) and `scoop`'s JSON schema in CI, and confirm the step skips cleanly when no secret is configured

## 6. Docs and release

- [ ] 6.1 `docs/cli.md`: an "Using ot from an agent" section (agent token, schema, exit codes, dry run, idempotency, non-interactive `--yes`, read-only mode), migration notes for `--yes` and exit 5. `docs/api.md`: `Idempotency-Key`, `auth` on `/me`, the agent content routes. Verify `make docs` and run every example against `./bin/opentodo` and `./bin/ot`
- [ ] 6.2 Verify `go install github.com/pixari/opentodo/cmd/ot@<tag>` works from a clean `GOPATH` with the module path as declared in `go.mod`, and document it in `docs/cli.md`
- [ ] 6.3 After PR #11 has merged: list `mcp` in `ot schema` and switch the bridge's scope detection to `auth.scope` from `/api/v1/me`. Verify `TestSchemaListsMcp` with `go test ./...`. Skip and note in the PR if #11 is still open
- [ ] 6.4 Measure the `ot` and server binary sizes against the previous release, record them in design.md "Implementation notes", update `ROADMAP.md` and add the `CHANGELOG.md` Unreleased entry calling out BREAKING `--yes` and exit 5. Verify `make check` passes
