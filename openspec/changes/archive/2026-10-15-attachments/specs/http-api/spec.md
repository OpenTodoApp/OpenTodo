# Spec Delta

## MODIFIED Requirements

### Requirement: Export
`GET /api/v1/export` SHALL return every project and task of the authenticated user, including soft-deleted ones, as a single JSON document with a format name and version, served as a download; the document SHALL also list the user's attachments (metadata, removed ones included). With `format=zip` the route SHALL stream a ZIP archive holding that document as `export.json` and the stored file of each attachment the user can read under `attachments/<id>/<name>`, without buffering files in memory. Both forms require authentication.

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
