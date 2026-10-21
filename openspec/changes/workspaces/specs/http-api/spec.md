## MODIFIED Requirements

### Requirement: Export
`GET /api/v1/export` SHALL return every project and task of the authenticated user, soft-deleted ones included, and their attachments' metadata as one JSON document with a format name and version, served as a download, together with a `workspaces` array (id, name, icon, colour, `default`, the caller's role, and for the caller's own workspaces the members' ids and roles and the groups with their member ids) and the `workspace_id` of every project, label, view and task that has one. With `format=zip` it SHALL stream a ZIP holding that document as `export.json` and each stored file the user can read under `attachments/<id>/<name>`, without buffering files in memory. Both forms require authentication.

#### Scenario: Export includes everything
- **WHEN** a user requests the export
- **THEN** the document lists all their projects and tasks with all fields, and carries `"format":"opentodo-export"` and `"version":1`

#### Scenario: Export with files
- **WHEN** a user requests `GET /api/v1/export?format=zip`
- **THEN** the response is a ZIP download whose `export.json` equals the JSON export and whose `attachments/` entries hold every uploaded file of the user's attachments, encrypted bytes as stored for an encrypted account

#### Scenario: Anonymous request
- **WHEN** a request without credentials asks for either form of the export
- **THEN** the response is 401 `unauthorized`

#### Scenario: Unknown format
- **WHEN** a user requests `format=tar`
- **THEN** the response is 400 `invalid_input` naming the accepted values

#### Scenario: Workspaces in the export
- **WHEN** a user who owns "Personal" and "Work" and is a member of "Family" requests the export
- **THEN** `workspaces` lists the three with the user's role, Personal marked `default`, Work with its members' ids, roles and groups, Family with the user's role only, and each project carries its `workspace_id`
