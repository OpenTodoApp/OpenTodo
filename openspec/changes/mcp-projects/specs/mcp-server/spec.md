## MODIFIED Requirements

### Requirement: Write tools
When allowed, `tools/list` SHALL add `create_tasks`, `update_tasks`, `complete_tasks`, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `update_project`, `set_favourite`, `create_sections`, `update_sections`, `reorder_sections`, `create_label`, `add_comment` and `trash_tasks`. No tool SHALL purge, archive or delete projects or sections, assign people, or change sharing, members, tokens, settings, webhooks, backups or imports. `trash_tasks` SHALL accept only tasks created by the same token. `update_project` SHALL accept a project `id` and any of `name`, `color` (`#rrggbb`), `icon` (a name from the icon catalogue, or null for none), `parent_id` (a project id or null, refused when it would make a project its own ancestor) and `position`. `set_favourite` SHALL add a project to the user's Favourites, at the end, or remove it, keeping the order of the other entries. `create_sections` SHALL create sections in one project with a `name` and optional `color`, `icon` and `position`; `update_sections` SHALL change a section's `name`, `color`, `icon` or `position`; `reorder_sections` SHALL give the listed sections of one project positions in the given order, before any section it does not list. Results reflect synced data; changes are written as operations, work for devices that are offline (they apply on their next sync) and converge with offline device edits by last-writer-wins per field.

#### Scenario: Create tasks
- **WHEN** an allowed assistant calls `create_tasks` with two items for project "Garden", one due tomorrow with priority 2
- **THEN** both tasks exist in "Garden" with those fields and the result lists their ids

#### Scenario: Reschedule overdue tasks
- **WHEN** an allowed assistant calls `schedule_tasks` with three overdue task ids and `due: {"date": "2026-10-16"}`
- **THEN** the three tasks are due on 2026-10-16 and any time of day they had is kept unless `time` is given

#### Scenario: Complete a recurring task
- **WHEN** an allowed assistant completes the current occurrence of a weekly task
- **THEN** the series advances exactly as a REST completion does, and a device completing the same occurrence offline converges to one completion

#### Scenario: Trash only its own creations
- **WHEN** an assistant calls `trash_tasks` with one task it created and one the user created in the web app
- **THEN** nothing is changed and the result is a tool error `not_permitted` naming the user-created task

#### Scenario: No mention notifications from assistants
- **WHEN** an assistant calls `add_comment` with a body containing `@bob` on a shared task
- **THEN** the comment is stored and Bob receives no mention notification

#### Scenario: Unknown or foreign target
- **WHEN** an assistant calls `update_tasks` with a task id that is deleted or belongs to another account
- **THEN** the result is a tool error `not_found` that does not distinguish the two and nothing changes

#### Scenario: Recolour and give an icon
- **WHEN** an allowed assistant calls `update_project` with the id of "Garden", `color: "#16A34A"` and `icon: "sprout"`
- **THEN** "Garden" shows a green sprout in the sidebar of every device after sync, and a phone that renamed "Garden" offline at the same time keeps its new name next to the new colour and icon

#### Scenario: Icon outside the catalogue
- **WHEN** an assistant calls `update_project` with `icon: "unicorn-rainbow"`, which is not in the catalogue
- **THEN** the response is a JSON-RPC `-32602` error naming `icon` and nothing is written

#### Scenario: Move under another project
- **WHEN** an assistant calls `update_project` to set the `parent_id` of "Home" to the id of its own child "Kitchen"
- **THEN** the result is a tool error `invalid` explaining the cycle and nothing changes

#### Scenario: Pin to Favourites
- **WHEN** an allowed assistant calls `set_favourite` with `kind: "project"`, the id of "Garden" and `favourite: true` while Favourites already lists two views
- **THEN** Favourites lists the two views and then "Garden", and calling it again changes nothing

#### Scenario: Set up sections
- **WHEN** an allowed assistant calls `create_sections` for "Garden" with "To buy", "To plant" (icon `shovel`) and "Done", then `reorder_sections` with "Done", "To buy", "To plant"
- **THEN** the project shows the three sections in that order, "To plant" with its icon, and the sections keep any tasks devices moved into them meanwhile

#### Scenario: No archive or delete
- **WHEN** an assistant calls `update_project` with `archived: true` or `deleted: true`
- **THEN** the response is a JSON-RPC `-32602` error naming the unexpected argument and nothing is written

### Requirement: Encrypted accounts and write tools
For an account with end-to-end encryption, `tools/list` SHALL list every write tool the caller may use with its content arguments (titles, descriptions, names, comment bodies) described as accepting ciphertext only and without plaintext length bounds, and SHALL leave out the arguments that cannot be sent as ciphertext (`origin_url`). A call supplying a content field as plaintext SHALL return the tool error `encryption_enabled` and change nothing; a content field supplied as a well-formed ciphertext envelope SHALL be stored unchanged. Structural changes (complete, reopen, schedule, move, priority, label ids, trash, and a project's or section's colour, icon, parent, position and Favourites entry) SHALL work and converge with offline device edits by last-writer-wins.

#### Scenario: Create refused for an encrypted account
- **WHEN** an allowed assistant of an encrypted account calls `create_tasks` with a plaintext title
- **THEN** the result is the tool error `encryption_enabled` and no op is written

#### Scenario: Content tools are listed as ciphertext only
- **WHEN** an allowed assistant of an encrypted account lists the tools
- **THEN** `create_tasks`, `update_tasks`, `create_project`, `update_project`, `create_label`, `add_comment`, `create_sections` and `update_sections` are listed, their text arguments say they accept ciphertext only, and no `origin_url` argument is offered

#### Scenario: Rescheduling works for an encrypted account
- **WHEN** the same assistant calls `schedule_tasks` for two tasks
- **THEN** both get the new plaintext due date and every enrolled device shows it after sync with titles still encrypted

#### Scenario: Recolouring works for an encrypted account
- **WHEN** the same assistant calls `update_project` with only `color` and `icon` for an encrypted project
- **THEN** both are written in plaintext, every enrolled device shows them after sync, and the project's name stays the ciphertext it was

#### Scenario: Ciphertext name is stored as given
- **WHEN** a client of an encrypted account calls `update_sections` with a `name` that is a well-formed `enc:v1:` envelope
- **THEN** the envelope is stored unchanged, and an unlocked device shows the decrypted name if the envelope was made with the account key for that section, or its "can't decrypt" placeholder otherwise

#### Scenario: Plaintext name refused
- **WHEN** a client of an encrypted account calls `update_project` with `name: "Garden"`
- **THEN** the result is the tool error `encryption_enabled` and nothing changes

### Requirement: Project description in reads
`list_projects` and the `opentodo://projects/{id}` resource SHALL include each project's description as Markdown inside the project's untrusted-text object, with the encrypted placeholder and `encrypted: true` when it is ciphertext, and SHALL never include `notes_doc`. No write tool SHALL change a project's description in this version; `update_project` accepts only `name`, `color`, `icon`, `parent_id` and `position`.

#### Scenario: Project brief visible to the assistant
- **WHEN** an assistant calls `list_projects` and a project's note begins with "Meet at gate B"
- **THEN** that project's entry carries the Markdown of the note under `untrusted_text.description`, next to its name

#### Scenario: Write refused
- **WHEN** an assistant calls `update_project` with a `description` argument
- **THEN** the call fails with an invalid-arguments error naming the unexpected argument and nothing is written

### Requirement: stdio bridge

The CLI SHALL bridge newline-delimited MCP JSON-RPC messages from stdin to the
configured server's `/mcp` endpoint and write only JSON-RPC responses to stdout.
It SHALL start with a `read` or `agent` token; an `agent` token reaches write
tools only through the server's write permission gate. A full-scoped token SHALL
need an explicit command-line override, and read-only mode SHALL accept only a
read-scoped token. In decrypting mode the bridge SHALL transform messages as the
`local-mcp-decryption` capability describes and otherwise behave the same.

#### Scenario: Request and notification forwarding

- **WHEN** a stdio client sends `initialize`, an initialized notification, and `tools/list`
- **THEN** the CLI forwards all three messages with the configured bearer token
- **AND** writes the two JSON-RPC responses, but no output for the notification

#### Scenario: Full-access credential safety

- **WHEN** the configured token has full scope and no override is present
- **THEN** the CLI refuses to start the bridge without forwarding protocol data

#### Scenario: Agent token accepted

- **WHEN** the configured token has the `agent` scope and no override is present
- **THEN** the bridge starts, and write tools are listed only if the owner's and the user's switches allow assistant writes

#### Scenario: Read-only mode cannot be weakened

- **WHEN** `--read-only` or `OPENTODO_READ_ONLY=1` is active with a full-scoped or agent-scoped token
- **AND** `--allow-full-token` is also present
- **THEN** the CLI refuses to start the bridge without forwarding protocol data

#### Scenario: Protocol error recovery

- **WHEN** the server returns a JSON-RPC parse error for a malformed input line
- **THEN** the CLI forwards that error and continues serving subsequent messages

#### Scenario: Recoverable server error

- **WHEN** the server returns a transient error for a JSON-RPC request with an id
- **THEN** the CLI writes a JSON-RPC internal error for that id and continues serving

#### Scenario: Server unavailable

- **WHEN** the configured server cannot be reached
- **THEN** the CLI exits with its unreachable-server status and writes no protocol response to stdout

## ADDED Requirements

### Requirement: Icon catalogue tool
`tools/list` SHALL advertise `list_icons`, with a read-only annotation, to every token that can list tools. It SHALL return the icon catalogue the app offers for projects and sections, each entry with `name`, `category` and `keywords` as defined by the catalogue of change `icons-and-section-style` (`internal/iconset`), filtered by an optional `query` matched and ordered exactly as the app's icon picker searches (case-insensitive; exact name, then name prefix, then keyword, then category) and capped by an optional `limit` (default 50, at most 200). It reads no user data, writes nothing and is subject to the same per-token limits as the read tools. Write tools SHALL accept an `icon` only when it is a `name` from this catalogue.

#### Scenario: Search for an icon
- **WHEN** an assistant calls `list_icons` with `query: "plant"`
- **THEN** the result lists catalogue icons whose name, keywords or category match "plant" (such as `sprout` and `flower`), in the picker's order, each with its category and keywords

#### Scenario: Bad limit
- **WHEN** an assistant calls `list_icons` with `limit: 1000`
- **THEN** the response is a JSON-RPC `-32602` error naming `limit`

#### Scenario: Without a token
- **WHEN** a request to `/mcp` calls `tools/call` for `list_icons` without a bearer token
- **THEN** the response is 401 with a `WWW-Authenticate: Bearer` challenge and no catalogue data

### Requirement: Caller-chosen ids on create
`create_tasks`, `create_project`, `create_label`, `create_sections` and `add_comment` SHALL accept an optional `id` per created item, a UUID. When no entity of any kind has that id the item SHALL be created with it; otherwise the item SHALL fail with the tool error `conflict` and nothing in the call SHALL be written. A retry of the same call, with the same `id` and the same `client_request_id`, SHALL return the original result without writing again. Items without `id` SHALL get ids as before.

#### Scenario: Chosen id is used
- **WHEN** an allowed assistant calls `create_sections` with `id: "3f1c…"` and a name
- **THEN** the created section has exactly that id and the result reports it

#### Scenario: Id already taken
- **WHEN** an assistant calls `create_project` with the id of an existing task
- **THEN** the result is the tool error `conflict` naming the id and nothing is written

#### Scenario: Malformed id
- **WHEN** an assistant calls `create_tasks` with `id: "not-a-uuid"`
- **THEN** the response is a JSON-RPC `-32602` error naming `id`
