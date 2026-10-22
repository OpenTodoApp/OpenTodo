## MODIFIED Requirements

### Requirement: Agent content routes
An `agent` token SHALL write only on `POST /api/v1/tasks|projects|labels`, `POST /api/v1/tasks/{id}/comments`, `PATCH /api/v1/tasks/{id}` (not `assignee_id`, `parent_id`, `position` or a restore), `PATCH /api/v1/projects/{id}` (`name`, `color`) and `DELETE /api/v1/tasks/{id}` (own creations), while both assistant switches are on, through the agent tool registry with MCP's limits, audit, E2EE refusal and mention suppression. On the task routes the accepted fields SHALL be `title`, `description`, `project_id`, `section_id`, `parent_id` (create only), `priority`, `due`, `labels`, `estimate_minutes`, `recurrence`, `fields`, `origin`, `deadline`, `start`, `evening`, `blocked_by` and `location`, plus `completed_at` and `deleted_at` on PATCH, each validated by the registry exactly as the sync path validates it and answered with the registry's codes (400 `invalid_input` naming the field, 404 `not_found`, 403 `forbidden`, 409 `encryption_enabled`). Other write routes and fields SHALL answer 403 `insufficient_scope`. A task in a project kept away from AI assistants (OpenSpec `agent-project-exclusion`) SHALL be `not_found` on these routes, and a create into such a project SHALL be refused the same way.

#### Scenario: Agent creates a task through REST
- **WHEN** both switches are on and an `agent` token POSTs `{"title":"Water plants"}` to `/api/v1/tasks`
- **THEN** the response is 201, an `agent.write` audit event is recorded, and devices show the task after sync

#### Scenario: Agent defers a task through REST
- **WHEN** both switches are on and an `agent` token PATCHes `/api/v1/tasks/{id}` with `{"start": "2026-10-31", "deadline": "2026-11-06", "evening": true}`
- **THEN** the response is 200 with the task carrying those three values, one operation per field is written with device `agent:<token-id>`, and devices show the task deferred after sync

#### Scenario: Agent sets blockers through REST
- **WHEN** an `agent` token PATCHes a task with `{"blocked_by": ["<other-task-id>"]}` naming an open task of the same project
- **THEN** the response is 200 and the task shows as waiting for that task on every device after sync

#### Scenario: Invalid planning value through REST
- **WHEN** an `agent` token PATCHes a task with `{"start": "later"}` or a `blocked_by` that names an Inbox task from a shared project
- **THEN** the response is 400 `invalid_input` naming the field and nothing changes

#### Scenario: Switch off
- **WHEN** the user's switch is off and an `agent` token POSTs to `/api/v1/tasks`
- **THEN** the response is 403 `writes_disabled_by_user` and nothing is created

#### Scenario: Forbidden field
- **WHEN** an `agent` token PATCHes a project with `{"archived": true}` or a task with `{"assignee_id": "…"}`
- **THEN** the response is 403 `insufficient_scope` and nothing changes

#### Scenario: Limits shared with MCP
- **WHEN** an `agent` token made 30 write calls in a minute through MCP and REST together and sends another REST write
- **THEN** the response is 429 `rate_limited` with `Retry-After` and nothing changes on any device

#### Scenario: Only its own creations go to the Trash
- **WHEN** an `agent` token sends `DELETE /api/v1/tasks/{id}` for a task the user created in the web app
- **THEN** the response is 403 `not_permitted` and the task stays

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials POSTs to `/api/v1/tasks/{id}/comments`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Encrypted account
- **WHEN** an `agent` token of an encrypted account POSTs a task with a title, or PATCHes one with a plaintext `location`
- **THEN** the response is 409 `encryption_enabled` and no op is written

#### Scenario: Project kept away from assistants
- **WHEN** an `agent` token PATCHes a task of a project whose owner switched on "Keep away from AI assistants"
- **THEN** the response is 404 `not_found`, indistinguishable from a deleted task, and nothing changes
