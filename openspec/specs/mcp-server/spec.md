# mcp-server Specification

## Purpose
Defines the read-only Model Context Protocol endpoint through which AI assistants can read a user's projects and tasks: how it is enabled, how it authenticates, which tools and resources it exposes, its limits, and the guarantee that it writes nothing and contacts nothing.

## Requirements

### Requirement: Off by default, enabled by the owner
The MCP endpoint SHALL be disabled until the owner enables it in Settings or through the optional `OPENTODO_MCP=true` preset. While disabled, `/mcp` SHALL answer 404 without evaluating credentials. The setting SHALL take effect without a restart and SHALL be changeable only by the owner through `PUT /api/v1/settings/mcp`.

#### Scenario: Disabled endpoint
- **WHEN** MCP is not enabled and a client POSTs to `/mcp` with a valid token
- **THEN** the response is 404 and nothing is logged about the token

#### Scenario: Member cannot enable
- **WHEN** a member calls `PUT /api/v1/settings/mcp`
- **THEN** the response is a 403 `forbidden` error and the setting is unchanged

### Requirement: Token authentication only
Every request to `/mcp` SHALL carry `Authorization: Bearer <api token>` and SHALL act as that token's user. Session cookies SHALL be ignored on this path. A missing, unknown or revoked token SHALL yield 401 with a `WWW-Authenticate: Bearer` challenge; failures SHALL be rate limited per client address. A request carrying an `Origin` header that does not match the server's public origin SHALL be refused with 403.

#### Scenario: Cookie is not enough
- **WHEN** a signed-in browser POSTs to `/mcp` with the session cookie and no bearer token
- **THEN** the response is 401 and no data is returned

#### Scenario: Revoked token
- **WHEN** a request presents a token the user revoked
- **THEN** the response is 401 and the attempt counts toward the rate limit

#### Scenario: Foreign origin
- **WHEN** a request carries a bearer token and an `Origin` of another site
- **THEN** the response is a 403 `bad_origin` error

### Requirement: Protocol surface
The endpoint SHALL implement the streamable HTTP transport for JSON-RPC 2.0 requests in stateless mode: `initialize` (negotiating a supported protocol version and advertising `tools` and `resources` capabilities and the server name and version), `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list` and `resources/read`. Unknown methods SHALL return JSON-RPC error `-32601`; malformed JSON `-32700`; invalid parameters `-32602`. `GET /mcp` SHALL answer 405.

#### Scenario: Initialize
- **WHEN** a client sends `initialize` with a protocol version the server supports
- **THEN** the response echoes that version, lists `tools` and `resources` capabilities and does not list `prompts`

#### Scenario: Unsupported protocol version
- **WHEN** a client requests a protocol version the server does not implement
- **THEN** the server answers with the latest version it supports and the client may continue or disconnect

#### Scenario: Unknown method
- **WHEN** a client calls `tasks/complete`
- **THEN** the response is a JSON-RPC error with code `-32601` and nothing changes

### Requirement: Read-only tools
`tools/list` SHALL advertise exactly `list_projects`, `list_tasks`, `get_task`, `search_tasks` and `today_summary`, each with an argument schema and a read-only annotation. `list_tasks` SHALL filter by view, project, label, priority, due range and completion with paging; `search_tasks` SHALL match title and description case-insensitively. Results SHALL be structured JSON, SHALL exclude deleted entities and SHALL cover only the token's user. No tool SHALL write anything.

#### Scenario: Today's tasks
- **WHEN** an assistant calls `list_tasks` with `view: "today"` and a `timezone`
- **THEN** the result lists open tasks due today or overdue in that time zone, each with id, title, project name, priority, due and labels, ordered overdue first

#### Scenario: Search
- **WHEN** an assistant calls `search_tasks` with `query: "dentist"`
- **THEN** the result lists non-deleted tasks whose title or description contains "dentist", with a `next_cursor` when more than `limit` match

#### Scenario: Invalid arguments
- **WHEN** `get_task` is called without `id` or `list_tasks` with `priority: 7`
- **THEN** the response is a JSON-RPC `-32602` error naming the argument

#### Scenario: Unsynced edits are not visible
- **WHEN** a device has created a task offline that has not synced yet
- **THEN** the tools do not return it until the device syncs, and the result carries the server time so the assistant can state how fresh the data is

### Requirement: Resources
`resources/list` SHALL expose `opentodo://projects` and `opentodo://views/{inbox|today|upcoming}`; `resources/templates/list` SHALL expose `opentodo://projects/{id}` and `opentodo://tasks/{id}`. `resources/read` SHALL return `application/json` content built from the same materialised reads as the tools, with the same exclusions. Reading a resource of another user or a deleted entity SHALL return a JSON-RPC `-32002` resource-not-found error.

#### Scenario: Read a project resource
- **WHEN** an assistant reads `opentodo://projects/<id>` for one of the user's projects
- **THEN** the content is the project with its open tasks as JSON

#### Scenario: Foreign or deleted entity
- **WHEN** an assistant reads `opentodo://tasks/<id>` for a task that is deleted or belongs to another user
- **THEN** the response is a `-32002` error that does not distinguish the two cases

### Requirement: Limits and no outbound calls
Responses SHALL contain at most 200 items with a cursor for more; request bodies over 1 MB SHALL be refused with 413; tool calls SHALL be logged at debug level with method and duration only, never with arguments or results. The MCP server SHALL make no network requests of its own and SHALL need no network to answer beyond the incoming request.

#### Scenario: Paging
- **WHEN** a user has 450 open tasks and an assistant calls `list_tasks` with `view: "all"`
- **THEN** the first result has 200 tasks and a `next_cursor`, and following the cursor twice returns the remaining 250 with no `next_cursor` at the end

#### Scenario: Network audit
- **WHEN** an assistant uses every tool and resource while the server's outbound traffic is inspected
- **THEN** the server makes no outbound request

### Requirement: Settings screen for assistants
Settings SHALL offer an "AI assistants" section where the owner enables or disables the endpoint and every user sees the endpoint URL, can create an API token with the `read` scope preselected and shown once, and reads short connection instructions. The screen SHALL work with the keyboard and SHALL show the last fetched state while offline with actions disabled.

#### Scenario: Create a read token for an assistant
- **WHEN** a user creates a token from the AI assistants section
- **THEN** the token is created with scope `read`, shown once with a copy action, and appears in the token list labelled read-only

#### Scenario: Member sees status only
- **WHEN** a member opens the section while the owner has not enabled MCP
- **THEN** the section explains that the owner has not enabled it and offers no toggle
