# Proposal

## Why

A person who connects an AI assistant for work only cannot keep it out of their private tasks: every API and MCP token acts as the whole account, all workspaces included (issue #1227). The `workspace` argument of a few read tools filters one request, and the assistant can leave it out; a project's "AI assistants" switch is opt-out and per project. CalDAV app passwords and calendar sync connections can already be limited to chosen workspaces (`sync-scope`); tokens cannot.

## What Changes

- **A token can be limited to chosen workspaces** when it is created: **All workspaces** (the default, today's behaviour) or **Only these** (one or more). It applies to every scope (`read`, `full`, `agent`, `admin`) and to the access tokens of an app connected over MCP OAuth (chosen on the consent page). The restriction is fixed for the token's life: to change it, create a new token.
- **A restricted token sees and changes only those workspaces**, over REST and MCP alike: projects, tasks, sections, custom fields, notes, labels, views and automation rules of the workspaces, and the reminders, comments, attachments and time entries of their tasks. Everything else answers as not found, and `list_workspaces` and `GET /api/v1/workspaces` list only the chosen ones.
- **Fail closed.** A restricted token reaches only routes declared workspace-aware; every other route (`/api/v1/sync`, export and import, settings, members, workspaces management, tokens, backups, CalDAV, the assistant, routines that send) answers 403 `token_restricted`. Account-wide records with no workspace (frames, slots, objectives, memories, reviews, saved places) are not readable; preferences and themes are readable, never writable.
- **New items land inside.** A create without a workspace or project goes to the token's first chosen workspace, never the account's default workspace; a create or move into another workspace is refused.
- **Settings and the CLI show it:** the token list names the workspaces; `ot tokens create --workspace <name>` (repeatable).

Not **BREAKING**: a token without a restriction behaves as today; one new table; no op schema change.

## Capabilities

### Modified Capabilities

- `account-access`: API tokens may carry a workspace restriction; Settings and the CLI create and show it.
- `mcp-server`: tools, resources and the OAuth consent honour a token's workspaces.

## Impact

`internal/store/migrations/NNNN_token_workspaces.sql`, `internal/auth` (tokens), `internal/httpapi/httpx` (the caller's reach, the `workspaces()` policy modifier), `internal/sync` (reads and `ApplyStrict` filtered by a context reach), `internal/mcpoauth` (consent), `internal/agenttools`, `internal/cli`, `web/src/app/settings` (token dialog), docs (`docs/api.md`, `docs/mcp.md`, `docs/cli.md`). Security-relevant: reviewed with `/security-review` before merge.
