# Proposal

## Why

People increasingly ask an AI assistant "what is on my plate today?" or "summarise the Garden project". With a commercial task manager that means handing a vendor's cloud access to a third party. OpenTodo can offer the same convenience on the user's own terms: a standard Model Context Protocol endpoint that assistants connect to with a token the user minted, that only reads, that is switched off until the owner turns it on, and that never contacts anything itself. A read-only first step keeps the blast radius small while the write semantics (and the question of whether an assistant should ever complete tasks on someone's behalf) are left to a later change.

## What Changes

- An MCP server endpoint at `/mcp` using the streamable HTTP transport (JSON-RPC 2.0 over POST, stateless), disabled by default and enabled by the owner in Settings or through an optional environment variable; while disabled the path answers 404.
- Authentication with bearer API tokens only; session cookies are refused on `/mcp` so there is no browser-originated access and no CSRF surface. API tokens gain an optional `read` scope so a token given to an assistant cannot write through the REST API or sync.
- Read-only tools: `list_projects`, `list_tasks` (view, project, label, priority, due range, completion filters, paging), `get_task`, `search_tasks` (title and description), `today_summary` (overdue, due today, counts per project). Resources: `opentodo://projects`, `opentodo://projects/{id}`, `opentodo://tasks/{id}`, `opentodo://views/today|upcoming|inbox`. No tool mutates anything; no prompts are advertised in this change.
- Results are structured JSON text with a documented shape; deleted entities are never returned; archived projects are returned only when asked.
- Limits: 200 items per response, same per-IP rate limiting as the API for authentication failures, request body cap, and the existing Origin validation for any request that carries one.
- No outbound calls: the server never contacts a model provider or registry; the assistant connects to the server.

Out of scope: write tools (create, complete, edit), prompts and sampling, OAuth-based authorization flows (tokens are enough for a personal server; `oidc-login` may revisit), server-sent event streams and resumable sessions (stateless responses suffice for read-only tools), exposing other users' data, a stdio transport or a bundled desktop connector (the `cli-client` change can add `opentodo mcp` as a stdio bridge over this endpoint).

Advances ROADMAP.md section 6, "Read-only MCP server for AI assistants, off by default" (`mcp-server`).

No breaking changes: no new mandatory environment variable (optional `OPENTODO_MCP=true` presets the owner toggle), no change to the op log; the `scope` column on API tokens is additive and existing tokens keep full access.

## Capabilities

### New Capabilities
- `mcp-server`: enablement, authentication and scope, protocol surface (initialize, tools, resources), each read-only tool and resource, limits and error behaviour, and the settings screen.

### Modified Capabilities
- `account-access`: the "API tokens" requirement gains an optional `read` scope chosen at creation; read-scoped tokens are refused on every write route (REST writes and `/api/v1/sync`) with 403.

## Impact

- Server: new `internal/mcp` package (minimal JSON-RPC 2.0 dispatcher, protocol version negotiation, tool and resource handlers over the existing materialised reads), `/mcp` route, `scope` column on `api_tokens` and enforcement in the auth middleware, owner setting in the shared `settings` table (created here if `backups`, `caldav` or `webhooks` have not yet). No new Go dependency: the protocol subset is small enough to implement with `encoding/json`, and an SDK would add several megabytes for features this change does not use.
- Client: Settings → AI assistants section (owner toggle, endpoint URL, token creation with the `read` scope preselected, connection instructions); token list shows scope.
- Docs: `docs/mcp.md` (enable, create a read token, connect from an assistant, tool and resource reference, limits), `docs/api.md` (token scope).
