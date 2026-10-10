# AI assistants (MCP)

OpenTodo can let an AI assistant read your projects and tasks through the [Model Context Protocol](https://modelcontextprotocol.io) (MCP), so you can ask it "what is on my plate today?" or "summarise the Garden project". The endpoint is:

- **Off by default.** The server owner turns it on; until then `/mcp` answers 404.
- **Read-only.** There are no write tools. An assistant cannot create, complete, edit or delete anything.
- **Yours only.** Each request acts as the account whose API token it carries and sees exactly what that account sees in the app: its personal projects and tasks plus the shared projects it is a member of. Deleted items are never returned.
- **Passive.** The assistant connects to your server. OpenTodo never contacts a model provider, a registry or anything else on its own.

## 1. Enable it (owner)

**Settings → AI assistants → Allow AI assistants (MCP endpoint)**. The change applies at once, without a restart, and is recorded in the audit log as `settings.changed` (`mcp.enabled`).

For deployments managed as code, the optional `OPENTODO_MCP=true` presets the toggle on the **first** start. After that the value in Settings wins, so the owner can still turn it off. Members see the status in the same section but no toggle.

## 2. Create a read-only token

In **Settings → AI assistants**, choose **Create read-only token**, or in **Settings → API tokens** pick the **Read-only** scope. Copy the token: it is shown once. A read-only token is refused on every route that writes (see [API → Authentication](api.md#authentication)), so even if it leaks from an assistant's configuration it cannot change your data. Revoke it in **Settings → API tokens** at any time.

Full-access tokens also work with `/mcp`, but there is no reason to give one to an assistant.

## 3. Connect an assistant

Use the endpoint URL shown in Settings (`https://todo.example.com/mcp`) as a **remote MCP server** with the **streamable HTTP** transport, and send the token as a header:

```
Authorization: Bearer ot_…
```

Clients that take a JSON server entry (Settings has a copy button that fills in the URL and your new token):

```json
{
  "mcpServers": {
    "opentodo": {
      "type": "http",
      "url": "https://todo.example.com/mcp",
      "headers": { "Authorization": "Bearer ot_…" }
    }
  }
}
```

Menus differ between assistants; look for "add custom connector", "remote MCP server" or "HTTP server". Clients that only speak stdio need a bridge that forwards to an HTTP endpoint with a header; OpenTodo does not ship one yet.

To try the endpoint by hand:

```bash
curl -sS https://todo.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"today_summary","arguments":{"timezone":"Europe/Rome"}}}'
```

**Time zones.** Due dates in OpenTodo are floating calendar dates ("2026-03-11", optionally with a time) unless they name a zone. What counts as "today" or "overdue" therefore depends on where you are: every date-dependent tool takes a `timezone` (an IANA name such as `Europe/Rome`) and uses UTC when none is given. Tell your assistant your time zone, or ask it to pass it. Every result also carries `server_time` (UTC), so the assistant can say how fresh the data is.

**Offline edits.** The server only knows what your devices have synced. A task added on a phone in airplane mode appears once the phone syncs.

## Tools

All tools are annotated `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`. Results come back both as `structuredContent` and as the same JSON in a text block. Timestamps in results are ISO 8601 in UTC; priorities are 1 (highest) to 4 (default). Lists hold at most 200 items; when there are more, the result has a `next_cursor` to pass back as `cursor`.

| Tool | Arguments | Result |
| --- | --- | --- |
| `list_projects` | `include_archived` (default false) | `{projects:[{id,name,color,archived,parent_id?,shared,role?,open_count}], inbox_open_count, server_time}` |
| `list_tasks` | `view` (`all` default, `inbox`, `today`, `upcoming`), `project_id`, `label` (name or id), `priority` (1–4), `due_from`, `due_to` (YYYY-MM-DD, inclusive), `include_completed` (default false), `timezone`, `limit` (≤200), `cursor` | `{tasks:[…], next_cursor, timezone, today, server_time}` |
| `get_task` | `id` (required), `timezone` | `{task, subtasks:[…], comments:[{id,parent_id?,author:{id,name},body,created_at,edited_at?}], timezone, today, server_time}` |
| `search_tasks` | `query` (required), `include_completed`, `timezone`, `limit`, `cursor` | like `list_tasks`; matches title or description, case-insensitive |
| `today_summary` | `timezone` | `{overdue:[…], due_today:[…], counts:{overdue,due_today,inbox,per_project:[{id,name,open}]}, timezone, today, server_time}` |

`today` lists open tasks due today or earlier, overdue first; `upcoming` lists open tasks due after today. Tasks are ordered by due date and time (undated last), then priority. Tasks in archived projects are left out unless `project_id` names that project.

A task in a result looks like this (`description` only in `get_task` and `search_tasks`):

```json
{
  "id": "0b6f…", "title": "Water the tomatoes", "description": "…",
  "project_id": "e34e…", "project": "Garden", "section_id": "…", "section": "Beds",
  "parent_id": null, "priority": 2,
  "due": { "date": "2026-03-11", "time": "01:00", "tz": "Asia/Tokyo", "local_date": "2026-03-10", "local_time": "12:00" },
  "overdue": true, "labels": ["outside"], "assignee": { "id": "…", "name": "Sam" },
  "recurrence": "every week", "estimate_minutes": 30,
  "completed": false, "created_at": "2026-03-01T08:00:00Z"
}
```

`local_date` and `local_time` appear for due dates pinned to a time zone and give the wall time in the requested `timezone`. Optional fields are left out when empty; `project` is `"Inbox"` for tasks without a project.

Errors: a missing or malformed argument (for example `priority: 7`) is a JSON-RPC `-32602` error whose message names the argument. `get_task` for an id that does not exist, is deleted or belongs to someone else returns a result with `isError: true` and the text `task not found`; the three cases are indistinguishable on purpose.

## Resources

| URI | Content |
| --- | --- |
| `opentodo://projects` | same as `list_projects` |
| `opentodo://views/inbox` | open tasks without a project |
| `opentodo://views/today` | as `list_tasks` with `view: today` |
| `opentodo://views/upcoming` | as `list_tasks` with `view: upcoming` |
| `opentodo://projects/{id}` | the project, its sections and its open tasks |
| `opentodo://tasks/{id}` | same as `get_task` |

Contents are `application/json`. Views use UTC; append `?tz=Europe/Rome` to the URI for another zone. A resource holds at most 200 tasks and says `"truncated": true` when there were more (use `list_tasks` to page). Reading a deleted or foreign project or task is a `-32002` "resource not found" error, the same for both.

## Protocol details

- JSON-RPC 2.0 over `POST /mcp` (streamable HTTP, stateless). Supported protocol versions: `2025-11-25`, `2025-06-18` and `2025-03-26`; `initialize` echoes the client's version when supported and answers the newest otherwise. Capabilities: `tools` and `resources`; no prompts, sampling, subscriptions or list-change notifications.
- Every request gets one `application/json` response; notifications get `202 Accepted` with no body. The server opens no event streams: `GET /mcp` is 405, and an `Accept` header that admits only `text/event-stream` is 406. No `Mcp-Session-Id` is issued. An `MCP-Protocol-Version` header naming an unsupported version is 400. Batches (JSON arrays) are accepted.
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list`, `resources/read`. Anything else is `-32601`; malformed JSON is `-32700` (HTTP 400).

## Limits and security

- **Authentication**: `Authorization: Bearer <API token>` only. The session cookie is ignored on `/mcp`, so a web page you visit cannot use your browser session to read your tasks. A missing, unknown or revoked token, or the token of a deactivated account, is 401 with `WWW-Authenticate: Bearer realm="OpenTodo MCP"`. Failed attempts count toward the per-address sign-in limit (10 per minute), after which requests get 429.
- **Origin**: a request that carries an `Origin` header other than this server's own (`OPENTODO_BASE_URL`, or the request's host) is refused with 403 `bad_origin`, as the MCP transport requires against DNS rebinding. Desktop and command-line clients send no `Origin`.
- **Size**: request bodies over 1 MB are refused with 413; responses hold at most 200 items per list.
- **Logging**: tool calls are logged at debug level with the JSON-RPC method and duration only, never with arguments or results.
- **Network**: the MCP server makes no outbound requests. A reverse proxy in front of OpenTodo should not log `Authorization` headers.
- **Disable**: turn the toggle off in Settings (immediate), or revoke the assistant's token.
