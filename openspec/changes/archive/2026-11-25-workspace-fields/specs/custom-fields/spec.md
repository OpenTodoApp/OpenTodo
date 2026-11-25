## MODIFIED Requirements

### Requirement: Field definition entity
A field definition SHALL belong to one project, or to one workspace (a workspace field, see "Workspace fields"), and have a name, a type (`text`, `number`, `date`, `choice`, `link` or `checkbox`), the options of a choice field, a sort position, a creation time and an optional deletion time. Its project, its workspace and its type SHALL NOT change after creation. Definitions SHALL be written as operations, applied locally first so they work offline, and SHALL converge under per-field last-writer-wins. At most 30 live definitions SHALL apply to a project, its workspace's and its ancestors' included.

#### Scenario: Add a field offline
- **WHEN** the device is offline and the user adds a number field "Cost" to project "Kitchen"
- **THEN** "Cost" appears at once in the project's task panels and columns, survives a reload, and reaches the project's other devices and members after the network returns

#### Scenario: Concurrent definitions converge
- **WHEN** device A adds "Cost" and device B adds "Client" to the same project offline, and both sync
- **THEN** the project has both fields on every device

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same field offline and both sync
- **THEN** every device shows the name written with the greater timestamp

#### Scenario: Limit
- **WHEN** a project already has 30 live fields and the user or an API client adds another
- **THEN** the addition is refused with a message naming the limit

### Requirement: Values follow the task's project
A task SHALL show and edit the fields that apply to its project only (its workspace's, its ancestors' and its own live definitions). A task in Inbox SHALL show no fields. When a task moves to another project, or its project to another workspace, its values SHALL stay in the data unchanged and SHALL NOT be shown until the task returns to a project the field applies to. Deleting a definition SHALL hide its values without writing to any task. No value is ever repaired or removed by a display rule.

#### Scenario: Move to another project
- **WHEN** a task with Cost 120 moves from "Kitchen" to "Garden", and no field named Cost applies to "Garden"
- **THEN** the panel shows Garden's fields only, the export still carries the value, and moving the task back shows Cost 120 again

#### Scenario: Definition deleted while a value is edited offline
- **WHEN** device A deletes "Cost" while device B sets a task's Cost offline, and both sync
- **THEN** the definition is deleted on both devices, the value is kept in the task's data and not shown, and nothing is lost

#### Scenario: Move a project to another workspace
- **WHEN** "Kitchen", whose tasks hold values of Personal's workspace field "Client", is moved to the workspace "Work", offline
- **THEN** Client disappears from its tasks, nothing is written to them, and the values show again once Kitchen is back in Personal

## ADDED Requirements

### Requirement: Workspace fields
A field definition without a project SHALL be a workspace field: its `workspace_id` names the workspace, null meaning the default workspace, and it SHALL apply to every project of that workspace that is the person's own, before the project's inherited and own fields, in position order. A project someone else shared with the person SHALL get none of the person's workspace fields, and SHALL count neither for their names nor for their limit, even where the person's sidebar places it in that workspace. A project's workspace SHALL be the one the sidebar places it in (its top-level project's). A workspace field naming a workspace the person does not have (a deleted one), or one the person no longer owns (after a transfer, or one an import or another device named), SHALL apply nowhere. Only the workspace's owner SHALL define and change its fields. A workspace field SHALL live in its owner's personal data: it is written as operations, applied locally first so it works offline, converges under per-field last-writer-wins, and reaches the owner's devices only; other members of a shared workspace or project SHALL NOT receive it, and values they hold under it SHALL stay in the tasks' data, hidden for them. Values SHALL be held under the workspace field's id, like any value. The set of applicable fields SHALL be derived on every device, offline too, identically on device and server; nothing is written when a project moves between workspaces.

#### Scenario: A field for every project
- **WHEN** the owner adds the text field "Client" to the workspace Personal, offline, which holds "Kitchen" and "Garden"
- **THEN** tasks in both projects show Client in the panel, as a column and as a badge at once, `client = "Acme"` matches them, and the field reaches the owner's other devices after the network returns

#### Scenario: Another workspace
- **WHEN** Personal defines "Client" and the project "Office" is in the workspace Work
- **THEN** Office's tasks do not show Client

#### Scenario: A member of the workspace
- **WHEN** the owner of Family defines "Stage" for Family and shares the project "House" in it with Bob
- **THEN** Bob does not see Stage on House's tasks, and the owner's Stage values stay in place when Bob edits them

#### Scenario: Concurrent edits converge
- **WHEN** two of the owner's devices rename the workspace field offline and both sync
- **THEN** every device shows the name written with the greater timestamp

#### Scenario: A project someone else shared
- **WHEN** Alice shares her project "Garden", which defines "Client", with Bob, Bob's sidebar shows it in his default workspace, and Bob adds a workspace field "Client" to that workspace
- **THEN** the field is added, Garden's tasks do not show Bob's Client, and the REST API refuses a value for it on a Garden task

#### Scenario: After a transfer
- **WHEN** Alice transfers the workspace Work, which has her workspace field "Effort", to Bob
- **THEN** Effort no longer applies to Work's projects for Alice, and renaming it is refused with 400 `invalid_input` saying only the workspace's owner changes its fields

### Requirement: Names and limits across a workspace
A workspace field's name SHALL be unique, ignoring case, among the workspace's live fields and the own fields of every project in the workspace: adding or renaming one SHALL be refused naming the project that uses the name. A project field SHALL NOT take a name of a workspace field that applies to it; the refusal SHALL name the workspace. A workspace SHALL have at most 30 live fields, and adding a workspace field SHALL be refused, naming the project, when a project of the workspace already has 30 applicable fields. A clash that arrives through a move or concurrent offline edits SHALL be shown, never repaired.

#### Scenario: Name used by a project
- **WHEN** the owner adds "size" to Personal while its project "Kitchen" defines "Size"
- **THEN** the addition is refused with a message naming "Kitchen", and focus stays on the name

#### Scenario: Name used by the workspace
- **WHEN** the user adds "client" to the project "Kitchen" while Personal defines "Client"
- **THEN** the dialog refuses it and says the field comes from "Personal"

#### Scenario: Limit across the workspace
- **WHEN** "Kitchen" has 29 own fields and Personal one, and the owner adds another field to Personal
- **THEN** the addition is refused with a message naming the limit and "Kitchen"

### Requirement: Workspace fields in the Fields dialog
The owner SHALL open a workspace's Fields… dialog from the workspace's settings; it SHALL list the workspace's own fields and offer add, rename, edit options, reorder and delete with the same rules and keyboard access as a project's, with one line saying only the owner sees them when the workspace has other members. A project's Fields… dialog SHALL list its workspace's fields first, grouped under "From" and the workspace's name, read-only, with one line saying they are edited in the workspace's settings. Renaming a choice option of a workspace field SHALL rewrite matching values in every project of the workspace, as ordinary operations; the delete confirmation SHALL count the tasks holding a value in all of them.

#### Scenario: Open a project's dialog
- **WHEN** the owner opens Fields… on "Kitchen" in Personal, which defines "Client"
- **THEN** Client is listed first under "From Personal" without edit, reorder or delete actions, and Kitchen's own fields follow with their actions

#### Scenario: Rename an option across the workspace
- **WHEN** the choice field "Stage" of Personal renames "Ordered" to "On order", and tasks in "Kitchen" and "Garden" hold "Ordered"
- **THEN** those tasks are updated to "On order" as ordinary field operations, offline too

### Requirement: Workspace fields in the API and tools
`POST /api/v1/fields` SHALL accept a `workspace_id` instead of a `project_id`: a workspace the caller owns, with authentication required like every fields route. Giving both or neither, an unknown workspace, a workspace the caller does not own, or a name or limit that breaks the workspace's rules SHALL be refused with 400 `invalid_input` naming the reason, the conflicting project or the workspace; `workspace_id` SHALL be immutable. The REST API SHALL accept on a task values for the workspace fields that apply to its project. The assistant and MCP tools SHALL list a project's workspace fields first, each with the id of its workspace, and accept values for them. The export SHALL carry `workspace_id` on definitions, and importing an own export SHALL restore a workspace field and its values.

#### Scenario: Create a workspace field via the API
- **WHEN** a script POSTs `{"name":"Client","type":"text","workspace_id":"<personal>"}` with the owner's bearer token
- **THEN** the response is 201 with the field, its `workspace_id` and no project, and a task of every project in Personal accepts `{"fields":{"<client-id>":"Acme"}}`

#### Scenario: Not the owner
- **WHEN** an admin of Family who is not its owner POSTs a field with Family's `workspace_id`
- **THEN** the response is 400 `invalid_input` saying only the workspace's owner defines its fields, and nothing is written

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials creates a workspace field
- **THEN** the response is 401 `unauthorized`

#### Scenario: Value for another workspace's field
- **WHEN** a PATCH on a task in "Office", in Work, carries a value for Personal's "Client"
- **THEN** the response is 400 `invalid_input` naming the field and nothing changes
