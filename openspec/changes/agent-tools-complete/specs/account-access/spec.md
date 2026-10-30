## MODIFIED Requirements

### Requirement: Agent content routes
An `agent` token SHALL write only on `POST /api/v1/tasks|projects|labels|sections|reminders`, `POST /api/v1/tasks/{id}/comments`, `PATCH /api/v1/tasks/{id}` (not `assignee_id`, `parent_id`, `position` or a restore), `PATCH /api/v1/projects/{id}` (`name`, `color`, `icon`, `parent_id`, `description`, or `archived` alone), `PATCH /api/v1/sections/{id}` (`name`, `color`, `icon`, `position`), `PATCH /api/v1/labels/{id}` (`name`, `color`, `position`), `PATCH /api/v1/reminders/{id}` (`offset_minutes`, `fire_at` of an absolute reminder), `DELETE /api/v1/reminders/{id}`, `POST /api/v1/time-entries`, `POST /api/v1/time-entries/stop`, `PATCH /api/v1/time-entries/{id}` (entries the same token created) and `DELETE /api/v1/tasks/{id}` (own creations), while both assistant switches are on, through the agent tool registry with MCP's limits, audit, E2EE refusal and mention suppression. On the task routes the accepted fields SHALL be `title`, `description`, `project_id`, `section_id`, `parent_id` (create only), `priority`, `due`, `labels`, `estimate_minutes`, `recurrence`, `fields`, `origin`, `deadline`, `start`, `evening`, `blocked_by` and `location`, plus `completed_at` and `deleted_at` on PATCH, each validated by the registry exactly as the sync path validates it and answered with the registry's codes (400 `invalid_input` naming the field, 404 `not_found`, 403 `forbidden`, 409 `encryption_enabled`). A project PATCH carrying `archived` together with another field SHALL be 400 `invalid_input`. `POST /api/v1/time-entries` with `taskId` alone SHALL start a timer and SHALL answer 409 `timer_running` while another entry of the user runs, unless the body carries `stopRunning: true`. Other write routes and fields, including `DELETE` of sections, labels, projects and time entries, SHALL answer 403 `insufficient_scope`. A task in a project kept away from AI assistants (OpenSpec `agent-project-exclusion`) SHALL be `not_found` on these routes, as SHALL its sections, reminders and time entries, and a create into such a project SHALL be refused the same way.

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
- **WHEN** an `agent` token PATCHes a project with `{"workspace_id": "…"}` or a task with `{"assignee_id": "…"}`
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

#### Scenario: Archive a project through REST
- **WHEN** both switches are on and an `agent` token of the project's admin PATCHes `/api/v1/projects/{id}` with `{"archived": true}`
- **THEN** the response is 200, the project and its sub-projects are archived on every device after sync, and one `agent.write` event for `archive_projects` is recorded

#### Scenario: Archive mixed with a rename
- **WHEN** an `agent` token PATCHes a project with `{"archived": true, "name": "Old"}`
- **THEN** the response is 400 `invalid_input` saying archiving goes on its own, and nothing changes

#### Scenario: Field values through REST
- **WHEN** an `agent` token PATCHes a task with `{"fields": {"<cost-id>": 120}}` where the task's project defines Cost as a number
- **THEN** the response is 200 with `"fields": {"<cost-id>": 120}` and one operation for that field is written with device `agent:<token-id>`

#### Scenario: Section and project note through REST
- **WHEN** an `agent` token POSTs `{"name":"Doing","project_id":"<p>"}` to `/api/v1/sections` and PATCHes `/api/v1/projects/<p>` with `{"description":"Budget approved."}`
- **THEN** both answer with the usual shapes (201 and 200), the section and the note reach every device after sync, and two `agent.write` events are recorded

#### Scenario: Reminder through REST
- **WHEN** an `agent` token POSTs `{"task_id":"<id>","kind":"relative","offset_minutes":0}` to `/api/v1/reminders` for a task due today at 10:00
- **THEN** the response is 201 with `fire_at` at 10:00 in the user's time zone

#### Scenario: Timer already running through REST
- **WHEN** the person's entry runs and an `agent` token POSTs `{"taskId":"<id>"}` to `/api/v1/time-entries`
- **THEN** the response is 409 `timer_running` and the person's entry keeps running; the same body with `"stopRunning": true` answers 201

#### Scenario: Deleting stays refused
- **WHEN** an `agent` token sends `DELETE /api/v1/time-entries/{id}`, `DELETE /api/v1/labels/{id}` or `DELETE /api/v1/sections/{id}`
- **THEN** the response is 403 `insufficient_scope` and nothing changes

#### Scenario: Reminder on a project kept away
- **WHEN** an `agent` token POSTs a reminder for a task of a project kept away from AI assistants
- **THEN** the response is 404 `not_found` and no reminder is created
