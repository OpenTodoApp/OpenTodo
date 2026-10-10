# Design

## Context

The server already materialises entities from `fields` for REST reads and knows the user from a bearer token. MCP's streamable HTTP transport is JSON-RPC 2.0 over POST with optional server-sent event streams; a read-only server with fast answers needs none of the streaming or session features. API tokens are currently all-or-nothing, which is the wrong default for a credential pasted into an assistant's configuration. The product rule is that every integration is off until configured and that the server makes no outbound calls on its own.

## Goals / Non-Goals

**Goals:**
- A standards-conformant endpoint that common MCP clients connect to with a URL and a bearer token.
- Strictly read-only, scoped tokens, owner-controlled enablement, zero outbound traffic.
- No new dependency; small code; conformance pinned by recorded fixtures.

**Non-Goals:**
- Write tools, prompts, sampling, elicitation, OAuth discovery flows, SSE streams, resumability, stdio transport in the server binary (a `cli-client` bridge can wrap the HTTP endpoint), multi-user admin tools.

## Decisions

### D1. Hand-written JSON-RPC subset, stateless streamable HTTP
`internal/mcp` implements: request/notification/batch parsing, `initialize`, `notifications/initialized` (accepted, ignored), `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list`, `resources/read`. Each POST is answered with one JSON response (`Content-Type: application/json`); `Accept` negotiation that insists on `text/event-stream` only gets 406; `GET /mcp` is 405 (no server-initiated stream); `Mcp-Session-Id` is not issued (stateless mode permitted by the spec). Protocol versions: the current version at implementation time plus the previous one; negotiation returns the latest supported.
- Why not the official Go SDK: it brings streaming sessions, prompts, sampling and JSON-schema reflection, adding roughly 3–5 MB to a 12 MB binary and a dependency tree to track for seven methods. The subset here is a few hundred lines with fixtures; if write tools or streaming arrive later the decision can be revisited behind the same route.

### D2. Authentication, scope and origin
`/mcp` uses a dedicated middleware: bearer token only (cookies never consulted, so no CSRF), `WWW-Authenticate: Bearer realm="OpenTodo MCP"` on 401, the shared per-IP limiter on failures, and the existing `originAllowed` check applied whenever an `Origin` header is present (MCP spec requirement against DNS rebinding; harmless for non-browser clients). Tokens gain `scope TEXT NOT NULL DEFAULT 'full'`; `requireAuth` learns the request's "write-ness" (method not GET/HEAD, or path `/api/v1/sync`) and answers 403 `insufficient_scope` for `read` tokens. MCP accepts both scopes but the settings screen preselects `read`.
- Alternative: a dedicated "assistant token" type. Scope on the existing tokens is smaller, reuses listing/revocation UI and serves scripts that only read too.

### D3. Tools and their shapes
All tools call the existing `sync.List`/`Get` materialised reads and filter in memory (personal data volumes; `List` already loads the user's entities). Output is `content: [{type:"text", text:<json>}]` plus `structuredContent` with the same object, and `isError: true` with a message for domain errors (unknown id). Tool annotations: `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
- `list_projects(include_archived=false)` → `{projects:[{id,name,color,archived,open_count}]}`
- `list_tasks(view, project_id, label, priority, due_from, due_to, include_completed, timezone, limit≤200, cursor)` → `{tasks:[…], next_cursor, server_time}`; `today`/`upcoming` evaluate dates in the given IANA `timezone` (default UTC, stated in the schema description) because due dates are floating.
- `get_task(id)` → full task plus project name and subtasks (`parent_id` children).
- `search_tasks(query, include_completed=false, limit, cursor)` → case-insensitive substring over title and description; good enough for personal volumes, swappable for FTS later without changing the tool contract.
- `today_summary(timezone)` → `{overdue:[…], due_today:[…], counts:{inbox, per_project:[…]}, server_time}` so a single call answers the most common question.
Cursors are opaque base64 of `(sort key, id)`; `limit` is clamped to 200.

### D4. Resources
Static: `opentodo://projects`, `opentodo://views/inbox|today|upcoming`; templates: `opentodo://projects/{id}`, `opentodo://tasks/{id}`. `resources/read` returns `contents:[{uri, mimeType:"application/json", text}]`. Views use UTC unless `?tz=` is appended to the URI (documented). Not-found and foreign ids both map to `-32002` so ids cannot be probed.

### D5. Enablement
`settings.mcp_enabled` (owner-only `PUT /api/v1/settings/mcp`, seeded by `OPENTODO_MCP`), cached in memory and invalidated on write; the mux checks it before authentication and returns 404 while disabled.

### D6. Data model impact
Additive: `api_tokens.scope` column with default `full` (existing rows keep full access), `settings` table if absent. No op fields, no sync protocol change, no export change (tokens are not exported).

### D7. Dependencies and footprint
No new Go module (`encoding/json`, `net/http`, `time` with embedded `tzdata` for `timezone` handling, ~450 KB if not already added by `data-import`). Binary growth under 250 KB; per request memory bounded by the user's entity count, identical to a REST list. Client: one settings section, under 4 KB gzipped.

## Risks / Trade-offs

- [MCP spec evolves and clients drop the versions we implement] → version negotiation is isolated in one table; fixtures recorded from two real clients (one desktop assistant, one CLI inspector) run in CI; adding a version is a small change.
- [A `full` token pasted into an assistant by habit] → the assistants section preselects `read` and labels tokens by scope in the list; docs recommend `read`.
- [Substring search is slow for very large accounts] → in-memory filtering of a few thousand tasks takes milliseconds; FTS can replace it later behind the same tool.
- [Token in an `Authorization` header logged by a reverse proxy] → same as REST today; docs already recommend not logging auth headers.
- [Assistants hammer the endpoint] → the per-IP limiter covers auth failures; a per-token request budget can be added if needed, since all reads are cheap.
- [Floating dates misinterpreted as UTC] → every date-dependent tool takes `timezone` and the server time is returned so the assistant can reason about freshness.

## Migration Plan

Additive migration (`scope` column default `full`, `settings` if absent); nothing changes for existing tokens or clients. Rollback: an older image ignores `scope` (tokens then behave as full, which matches the pre-upgrade state) and returns 404 for `/mcp`.

## Open Questions

- Which write tools, if any, a later change should expose (likely `create_task` and `complete_task` behind an explicit `write` scope and a per-call confirmation hint).
- Whether to publish an `/.well-known/oauth-protected-resource` document pointing at token creation docs for clients that look for it; harmless and small, deferred until a client needs it.
