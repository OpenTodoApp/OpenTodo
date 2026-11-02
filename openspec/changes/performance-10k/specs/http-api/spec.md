## ADDED Requirements

### Requirement: Collection list by project
`GET /api/v1/{collection}` SHALL accept `project_id` on a collection whose items have a project (tasks, sections, custom fields, notes and the like) and then SHALL list only the items of that project, in the same order and with the same `include_deleted` rule as the whole list, reading only that project's items from the database. An empty value, or the parameter on a collection whose items have no project, SHALL answer `400 invalid_input` naming the parameter. An id the caller cannot see lists nothing. The route keeps its authentication; the parameter only filters synced rows, so offline behaviour and convergence are unchanged.

#### Scenario: One project's tasks
- **WHEN** a script requests `/api/v1/tasks?project_id=<id>` for a project of 2,000 tasks in a 10,000-task account
- **THEN** the response lists those 2,000 tasks and no other, in the order of the whole list

#### Scenario: Not a project collection
- **WHEN** a script requests `/api/v1/labels?project_id=<id>` or `/api/v1/tasks?project_id=`
- **THEN** the response is 400 `invalid_input` naming `project_id`
