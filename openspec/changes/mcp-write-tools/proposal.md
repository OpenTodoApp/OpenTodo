# MCP write tools: assistants can act, under the user's control

## Why

The read-only MCP server (`mcp-server`) answers "what is on my plate?", but the next question people ask an assistant is "move the overdue ones to Friday" or "add these three steps to the Garden project". Today the only way to let an assistant do that is to paste a `full` API token into it, which also lets it revoke tokens, change settings, purge the Trash and sync arbitrary operations. This change adds a small set of write tools behind an explicit, separate permission, with every change going through the operation log so it syncs, converges, shows up in history and can be undone like any other edit.

This is the first of three "Bring your agent" changes (`mcp-write-tools`, then `agent-ready-cli`, then `in-app-assistant`). It introduces the shared pieces the other two build on: the `agent` token scope, the per-user "Allow AI assistants to make changes" switch, the agent tool registry and the prompt-injection threat model (design.md D1, D9).

## What Changes

- **New token scope `agent`.** Alongside `full` and `read`. An `agent` token can read everything a `read` token can and can call MCP write tools. On REST it is still refused on every write route, so it can never mint tokens, change settings or sync raw operations. `full` and legacy tokens keep read-only tools on MCP: write tools need an `agent` token, so turning writes on never quietly upgrades a token someone pasted into an assistant months ago.
- **Two switches, both off by default.** The owner allows assistant writes on the server ("AI assistants may make changes", added to the existing MCP setting). Each user allows them for their own account ("Allow AI assistants to make changes", new `GET/PUT /api/v1/me/agent-access`). Writes need both switches on and an `agent` token. `tools/list` lists write tools only when all three hold.
- **Write tools** (one registry, see D1): `create_tasks`, `update_tasks`, `complete_tasks`, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `create_label`, `add_comment`, and `trash_tasks`, which works only on tasks the same token created. Nothing deletes permanently, archives or deletes projects, assigns people, or touches sharing, members, tokens, settings, webhooks, backups or import/export.
- **Through the op log.** Every write tool builds ops and applies them with `ApplyStrict` as the token's user, with device `agent:<token-id>`, then calls `NotifyApplied`. Sharing roles, validation and recurrence rules work exactly as they do for REST writes. A refused batch changes nothing.
- **Limits:** at most 50 entities per call, 30 write calls per minute and 1,000 changed entities per day for each token. Over a limit the tool returns an error that says when to retry. Request size stays capped at 1 MB.
- **Attribution and undo.** History shows these writes as "AI assistant (<token name>)". Each write call adds an `agent.write` audit event with the tool name, token id, entity count and outcome, never content. Undo works through the existing paths: restore from the Trash, restore an earlier value from history, or reopen a task.
- **Prompt-injection defences.** Tool results label user-written text as untrusted data. No tool can reach the network, sharing or credentials. Writes are limited to scopes the user can already edit. Comments written by an assistant send no mention notifications. See design D9.
- **End-to-end encryption.** For an encrypted account the server cannot read or write content. Tools that need content (`create_tasks`, `create_project`, `create_label`, `add_comment`, and content fields of `update_tasks`) are left out of `tools/list`, and a call that tries them anyway gets an `encryption_enabled` error. Structural tools (complete, reopen, schedule, move, priority, label ids) keep working.
- **Demo instance.** `/mcp` is already refused there with `demo_restricted`. The new per-user route is added to the deny list.
- **CLI:** `ot token create <name> --scope read|agent|full` (default `full`, as today). `ot token list` shows the scope.
- **Settings UI:** the AI assistants section gets the owner's write switch, the user's switch, and an "assistant that can make changes" token shortcut that creates an `agent` token.

## Out of scope

- Permanent deletion, project deletion or archiving, assignment, sharing and membership changes, any settings or credential change, and imports. Nothing here can change any of these, now or by configuration.
- Per-tool permissions or per-project allow lists for tokens (rejected for v1, design D3).
- OAuth authorization flows, MCP prompts, sampling, elicitation and server-sent event streams.
- The stdio transport. Open PR #11 (`mcp-stdio-bridge`, external contributor) adds `ot mcp`, and this change does not duplicate it. D10 describes how that bridge should treat `agent` tokens once both have landed.
- The in-app assistant (`in-app-assistant`) and agent use of the REST API through `ot` (`agent-ready-cli`). Both reuse what this change introduces.

ROADMAP: adds the "Bring your agent" group and advances its first item, `mcp-write-tools`. This also answers the open question recorded in the archived `mcp-server` design ("which write tools, if any").

**BREAKING:** none. There is no new mandatory environment variable and no op-log format change. Existing tokens keep their scope, existing MCP clients see the same five read tools until someone opts in, and `/mcp` stays 404 until the owner enables it.

## Capabilities

### New Capabilities
- None. The work extends `mcp-server`.

### Modified Capabilities
- `mcp-server`: the tool list depends on the token and the switches. New requirements cover the write permission gate, write tools, op-log writes, write limits, untrusted-content marking, encrypted accounts, and the settings screen.
- `account-access`: "API tokens" gains the `agent` scope.
- `audit-log`: "Recorded events" gains `agent.write`.
- `trash-and-history`: history labels writes made by an AI assistant.
- `cli-client`: `ot token create --scope`.

## Impact

- Server: a new `internal/agenttools` package (the shared tool registry: definitions, argument validation, change planning, limits). `internal/mcp` moves its read tools into the registry without changing behaviour and dispatches write tools. Plus auth scope handling, `internal/httpapi` (`/api/v1/me/agent-access`, MCP settings body, demo rule) and `internal/audit` (event `agent.write`).
- Data: two new side tables, `api_token_agent` (marks a `read` row as an `agent` token, so downgrades fail safe) and `user_agent_access`. No op fields change.
- Client: Settings → AI assistants, the token dialog's scope choice, and the history device label in `web/src/lib/history.ts`.
- CLI: `--scope` on `ot token create`.
- Docs: `docs/mcp.md` (write tools, permissions, threat model, undo), `docs/api.md` (scope, route), `docs/cli.md`.
- Size: no new dependency. Server binary is expected to grow by under 150 KB and the web main chunk by under 2 KB gzipped.
