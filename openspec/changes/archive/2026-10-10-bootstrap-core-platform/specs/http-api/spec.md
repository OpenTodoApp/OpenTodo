# Spec Delta

## Purpose

Defines the JSON API that the web app, scripts and future integrations use, including the write-through guarantee that keeps API writes and device sync consistent.

## ADDED Requirements

### Requirement: Versioned JSON API
All application endpoints SHALL live under `/api/v1/` and SHALL exchange JSON. Errors SHALL use the envelope `{"error":{"code":"<machine_code>","message":"<human text>"}}` with an appropriate HTTP status.

#### Scenario: Unknown route
- **WHEN** an authenticated client requests an undefined path under `/api/v1/`
- **THEN** the response is a 404 with the error envelope and code `not_found`

#### Scenario: Malformed body
- **WHEN** a request body is not valid JSON or exceeds 4 MB
- **THEN** the response is a 400 with code `bad_request`

### Requirement: Collection endpoints
The API SHALL expose `projects` and `tasks` collections with list, get, create, patch and delete. Lists SHALL exclude soft-deleted items unless `include_deleted=true` is given. Create SHALL return the stored entity with its generated id and defaults.

#### Scenario: Create a task via the API
- **WHEN** a script POSTs `{"title":"Buy milk"}` to `/api/v1/tasks` with a bearer token
- **THEN** the response is 201 with the task including `id`, `priority` 4, `created_at` and `position`

#### Scenario: Patch rejects unknown fields
- **WHEN** a PATCH body contains a field that is not part of the entity schema
- **THEN** the response is 400 with code `invalid_input` and nothing changes

#### Scenario: Delete is a tombstone
- **WHEN** a DELETE succeeds
- **THEN** the response is 204, a subsequent GET of that id is 404, and the item is still present in the export with `deleted_at` set

### Requirement: Write-through to the operation log
Every API write SHALL be recorded as operations stamped with server time and the device id `server`, so that devices receive API-originated changes on their next sync and the last-writer-wins rules apply uniformly.

#### Scenario: API write reaches devices
- **WHEN** a task is created through the API and a device syncs afterwards
- **THEN** the device receives the operations and shows the task

### Requirement: Sync endpoint
`POST /api/v1/sync` SHALL accept `{device, cursor, ops}` and return `{applied, duplicates, ops, cursor, hasMore, serverTime}`. A missing device id SHALL be a 400 error. At most 1000 operations SHALL be accepted or returned per request.

#### Scenario: Oversized batch
- **WHEN** a request carries more than 1000 operations
- **THEN** the response is 400 with code `invalid_op`

### Requirement: Export
`GET /api/v1/export` SHALL return every project and task of the authenticated user, including soft-deleted ones, as a single JSON document with a format name and version, served as a download.

#### Scenario: Export includes everything
- **WHEN** a user requests the export
- **THEN** the document lists all their projects and tasks with all fields, and carries `"format":"opentodo-export"` and `"version":1`

### Requirement: Health endpoint
`GET /healthz` SHALL require no authentication and SHALL return 200 with the version when the database is reachable, otherwise 503.

#### Scenario: Healthy server
- **WHEN** a monitor requests `/healthz`
- **THEN** the response is 200 with `{"status":"ok","version":"<version>"}`
