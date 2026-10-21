## ADDED Requirements

### Requirement: Workspaces in tools
`tools/list` SHALL advertise a read tool `list_workspaces` (the caller's workspaces with id, name, role, default flag, and the member and group names of the caller's own workspaces, marked as untrusted text), and `list_projects`, `list_tasks` and `search_tasks` SHALL accept an optional `workspace` argument (id or exact name; absent means every workspace) and SHALL carry each project's `workspace_id` and workspace name in results. `create_project` SHALL accept an optional `workspace_id` (default: the account's default workspace), `create_tasks` SHALL accept it for tasks without a project, and `update_project` SHALL accept it only from the project's owner. The resource `opentodo://workspaces` SHALL list the same as `list_workspaces`. A `workspace` the caller does not belong to SHALL answer the invalid-argument error; writes stay under the write permission gate, limits and audit as every other write.

#### Scenario: Projects of one workspace
- **WHEN** an assistant calls `list_projects` with `workspace: "Work"`
- **THEN** the result lists Work's non-deleted projects only, each with `workspace_id` and `workspace: "Work"`

#### Scenario: Unknown workspace
- **WHEN** an assistant calls `list_tasks` with `workspace: "Acme"` and the account has no such workspace
- **THEN** the response is a JSON-RPC `-32602` error naming the argument and listing the available workspace names

#### Scenario: Create in a workspace
- **WHEN** an assistant with an `agent` token calls `create_project` with `workspace_id` of "Work" while the switches allow writes
- **THEN** the project is created in Work through the operation log, attributed and audited like any agent write, and devices in Work show it after sync

#### Scenario: Read token
- **WHEN** a `read` token calls `tools/list`
- **THEN** `list_workspaces` is listed with the other read tools and no write tool is
