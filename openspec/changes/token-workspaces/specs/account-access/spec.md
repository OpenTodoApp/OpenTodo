## ADDED Requirements

### Requirement: Tokens limited to chosen workspaces
Creating an API token (Settings, `POST /api/v1/tokens`, `ot tokens create`) SHALL accept an optional list of workspaces the person belongs to; without one the token covers all workspaces as before. The list SHALL be fixed for the token's life and shown in the token list. A restricted token SHALL read and change only the projects, tasks, sections, custom fields, notes, labels, views and automation rules of those workspaces and the reminders, comments, attachments and time entries of their tasks; anything else SHALL answer as not found. A create without a workspace or project SHALL land in the token's first workspace, and a create or move into another workspace SHALL be refused with 403 `token_restricted`. Every route not declared workspace-aware, including `/api/v1/sync`, export, import, settings, members, workspace management, tokens and backups, SHALL refuse a restricted token with 403 `token_restricted`. An unknown workspace id at creation SHALL be refused with 400 `invalid_input`.

#### Scenario: Work only
- **WHEN** a person creates a `full` token limited to the workspace Work and lists tasks with it
- **THEN** only tasks of Work's projects and Work's Inbox are returned, and asking for a task of the workspace Home answers 404 `not_found`

#### Scenario: New task without a project
- **WHEN** the token creates a task with only a title
- **THEN** the task is in Work's Inbox, not the default workspace's

#### Scenario: Sync and export are closed
- **WHEN** the restricted token calls `POST /api/v1/sync` or the export
- **THEN** the response is 403 `token_restricted`

#### Scenario: A token without a restriction
- **WHEN** a token is created without workspaces
- **THEN** it covers every workspace, as before
