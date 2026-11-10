# Spec Delta

## ADDED Requirements

### Requirement: Block views for MCP Apps
A client SHALL count as Apps-capable when its `initialize` announces the `io.modelcontextprotocol/ui` extension with the MIME type `text/html;profile=mcp-app`. The server SHALL then answer with an `Mcp-Session-Id` that marks later requests of that client as Apps-capable, and it SHALL keep no session state. For such a client, `show_tasks`, `show_calendar` and `show_deadlines` SHALL name the views `ui://opentodo/blocks/tasks`, `…/calendar` and `…/deadlines` in their `_meta.ui.resourceUri`. A call SHALL check its arguments and ids like the in-app assistant. It SHALL return the block and its rows as structured content and, as text, only the kind and count shown. The rows SHALL leave out projects kept away from assistants. A view SHALL be a static, self-contained HTML document with the MIME type `text/html;profile=mcp-app` that holds no user content. It SHALL make no network request and carry a strict Content-Security-Policy, and it SHALL set every user-written string as text, never as markup. An encrypted account SHALL get display tools only through `ot mcp --decrypt`, which decrypts the rows on the user's machine.

#### Scenario: Tasks rendered by the host
- **WHEN** an Apps-capable client calls `show_tasks` with two task ids
- **THEN** the structured content lists both tasks with their titles and dates, the text content names only the kind and count, and the tool's `ui://opentodo/blocks/tasks` view loads nothing from the network

#### Scenario: Malicious title
- **WHEN** a task's title is `<img src=x onerror=alert(1)>` and it is shown in a block
- **THEN** the view shows the title as text and runs no script of it

#### Scenario: Unknown resource
- **WHEN** a client reads a `ui://opentodo/blocks/...` resource that is not one of the three views
- **THEN** the server answers a not-found error

#### Scenario: Without a token
- **WHEN** an MCP request without a token reads a block resource
- **THEN** the request is refused as unauthenticated like every MCP request

#### Scenario: Encrypted account on the server path
- **WHEN** an Apps-capable client of an encrypted account lists tools or calls `show_tasks` directly
- **THEN** no display tool is listed and the call is refused with `encryption_enabled`, pointing to `ot mcp --decrypt`

### Requirement: Actions in a block follow the write rules
A block SHALL offer ticking its tasks only when the caller passes the write gate (the owner's MCP writes switch, the user's switch and an `agent` token). Ticking SHALL be a `complete_tasks` call, and unticking a `reopen_tasks` call, made by the view through the host. The call SHALL run under the same gate and limits as any MCP write. Without the gate, the block SHALL be read-only.

#### Scenario: Read token
- **WHEN** a client with a `read` token calls `show_tasks`
- **THEN** the structured content says the tasks cannot be completed, and a `complete_tasks` call from the view is refused

#### Scenario: Agent token with both switches on
- **WHEN** a client with an `agent` token, the owner's writes switch and the user's switch on, ticks a task in a block
- **THEN** the task is completed through the op log like any MCP write
