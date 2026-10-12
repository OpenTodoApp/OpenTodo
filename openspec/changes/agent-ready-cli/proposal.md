# Agent-ready CLI: `ot` as a dependable tool for agent harnesses

## Why

Coding agents and automation harnesses already drive command-line tools, and `ot` is the obvious way for them to reach a user's OpenTodo. `ot` was built for people and simple scripts, though, and a few of its behaviours are risky or vague when an agent is the one typing:

- `ot rm` and `ot project rm` delete without asking when stdout is not a terminal (`App.confirm` returns true off a TTY), so an agent piping output deletes silently.
- The JSON shapes are "whatever the API returns", with no version and no machine-readable command list. An agent has to scrape `ot help`.
- Writes cannot be previewed. A retried `ot add` after a timeout creates a duplicate, because REST create ignores client ids.
- `ot` cannot tell which scope its token has, and it cannot use the safer `agent` scope that `mcp-write-tools` introduces.

This change is the second of the "Bring your agent" group. It builds on `mcp-write-tools` (the `agent` scope, the two switches, the shared limits and the threat model, see that change's design D1, D2, D3, D9 and D11).

## What Changes

- **Stable, versioned JSON.** `--json` output is documented with JSON Schemas and an `output_version` (starting at 1). Breaking changes need a new version that callers opt into. The error envelope gains the additive field `exit`. On failure in JSON mode stdout still carries the envelope (unchanged contract) and stderr gets one human-readable line.
- **Exit codes documented, plus one new code.** 0, 1, 2, 3 and 4 stay as they are. The new code 5, "not permitted", covers a refused scope, role, switch or read-only mode. Agents should not retry those, and should ask the user instead.
- **Command discovery:** `ot schema` (alias `ot help --json`) prints every command with its arguments, flags, write and destructive flags, dry-run support, exit and error codes, and the output schemas. It works offline.
- **`--dry-run`** on every write command resolves references, validates, and prints the requests it would send without writing anything.
- **Idempotency.** `ot add` and `ot project add` take `--idempotency-key`, sent as the new `Idempotency-Key` header on `POST /api/v1/{collection}`. The server derives the entity id and op ids from the key, so retries converge instead of duplicating. `ot done` and `ot reopen` on tasks already in the target state exit 0 and change nothing.
- **Non-interactive by default.** Off a terminal, or with `--json`, destructive commands (`rm`, `project rm`, `token revoke`, `auth logout`) refuse without `--yes` (exit 2). Prompts never appear without a TTY.
- **Read-only mode.** `--read-only`, or the optional `OPENTODO_READ_ONLY=1`, refuses write commands locally. `ot` learns its token's scope from the additive `auth` object on `GET /api/v1/me`, and with a `read` token it refuses writes locally with exit 5. `ot auth status` shows the scope.
- **`agent` tokens on REST content routes.** An `agent` token may create tasks, projects, labels and comments, edit tasks, rename or recolour projects, and move to the Trash tasks it created itself, under the same two switches, limits, audit event, E2EE rules and missing mention notifications as MCP write tools. These writes run through the shared registry and carry device `agent:<token-id>`. Every other REST write stays refused.
- **Agent skill file.** `SKILL.md` describes how an agent should use `ot` safely. It is embedded in `ot` (`ot skill` prints it) and published with each release as `opentodo-agent-skill.zip`.
- **Repository decision:** the CLI stays in the monorepo. Homebrew and Scoop manifests may live in tiny separate repositories that release CI updates (design D10).

## Out of scope

- A local cache or offline queue in `ot`. It stays an online client.
- Shell completion (a separate ROADMAP idea, although `ot schema` makes it easy later).
- Natural-language quick add in `ot` (separate ROADMAP idea).
- The MCP stdio bridge `ot mcp`. That is open PR #11 from an external contributor and is not duplicated here (design D11).
- Publishing to Homebrew or Scoop. This change prepares the manifests and the CI step, and creating the external repositories is an owner decision (open question).
- Any change to MCP tools (`mcp-write-tools`) or the in-app assistant (`in-app-assistant`).

ROADMAP: advances "Bring your agent" item 2, `agent-ready-cli`. It also prepares the "Shell completion for `ot`" idea, since `ot schema` provides the command model.

**BREAKING (CLI behaviour only, not the op log):** off a terminal or with `--json`, `ot rm`, `ot project rm`, `ot token revoke` and `ot auth logout` now refuse without `--yes` (exit 2), where they used to proceed silently. Scripts must add `--yes`. Also, a 403 `insufficient_scope` now exits with code 5 instead of 1. No new mandatory environment variable. The op log format is unchanged.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `cli-client`: JSON contract and exit codes, non-interactive safety, delete confirmation, plus new requirements for command discovery, dry run, idempotent commands, read-only mode, and the agent skill file.
- `http-api`: `Idempotency-Key` on create, and write-through attribution for `agent` tokens.
- `account-access`: `agent` tokens on REST content routes, and credential introspection on `GET /api/v1/me`.

## Impact

- CLI: `internal/cli` (schema model, dry-run plumbing, flags, exit code 5, stderr line, embedded `SKILL.md`), `cmd/ot`.
- Server: `internal/httpapi` (`Idempotency-Key`, the `auth` object on `/api/v1/me`, agent-token routing of REST content writes through `internal/agenttools`), `internal/auth` (scope helpers).
- Release: CI publishes `opentodo-agent-skill.zip` next to `ot-<os>-<arch>`, plus optional manifest generation for Homebrew and Scoop.
- Docs: `docs/cli.md` (agent section, schema, exit codes, dry run, idempotency), `docs/api.md` (`Idempotency-Key`, `auth` on `/me`, agent routes), the skill file itself.
- Size: no new dependency. The `ot` binary is expected to grow by under 80 KB (schema model and embedded skill text), the server by under 40 KB. No web change.
