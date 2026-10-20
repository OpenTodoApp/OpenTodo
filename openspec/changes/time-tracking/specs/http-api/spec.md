# Spec Delta

## MODIFIED Requirements

### Requirement: Export
`GET /api/v1/export` SHALL return every project and task of the authenticated user, soft-deleted ones included, their attachments' metadata and the time entries the user can read (deleted ones included) as one JSON document with a format name and version, served as a download. With `format=zip` it SHALL stream a ZIP holding that document as `export.json` and each stored file the user can read under `attachments/<id>/<name>`, without buffering files in memory. Both forms require authentication.

#### Scenario: Export includes everything
- **WHEN** a user requests the export
- **THEN** the document lists all their projects and tasks with all fields, carries `"format":"opentodo-export"` and `"version":1`, and holds a `time_entries` array with every field of each entry

#### Scenario: Export with files
- **WHEN** a user requests `GET /api/v1/export?format=zip`
- **THEN** the response is a ZIP download whose `export.json` equals the JSON export and whose `attachments/` entries hold every uploaded file of the user's attachments, encrypted bytes as stored for an encrypted account

#### Scenario: Anonymous request
- **WHEN** a request without credentials asks for either form of the export
- **THEN** the response is 401 `unauthorized`

#### Scenario: Unknown format
- **WHEN** a user requests `format=tar`
- **THEN** the response is 400 `invalid_input` naming the accepted values

#### Scenario: Time entries of a shared task
- **WHEN** two members tracked time on a task of a shared project and one of them exports
- **THEN** both entries are in `time_entries` with their `user_id`, as both are rows the exporting member can read
