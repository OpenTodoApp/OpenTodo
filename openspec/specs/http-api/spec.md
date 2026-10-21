# http-api Specification

## Purpose
Defines the JSON API that the web app, scripts and future integrations use, including the write-through guarantee that keeps API writes and device sync consistent.

## Requirements

### Requirement: Versioned JSON API
All application endpoints SHALL live under `/api/v1/` and SHALL exchange JSON. Errors SHALL use the envelope `{"error":{"code":"<machine_code>","message":"<human text>"}}` with an appropriate HTTP status.

#### Scenario: Unknown route
- **WHEN** an authenticated client requests an undefined path under `/api/v1/`
- **THEN** the response is a 404 with the error envelope and code `not_found`

#### Scenario: Malformed body
- **WHEN** a request body is not valid JSON or exceeds 4 MB
- **THEN** the response is a 400 with code `bad_request`

### Requirement: Collection endpoints
The API SHALL expose `projects`, `tasks` and `fields` collections with list, get, create, patch and delete. Lists SHALL exclude soft-deleted items unless `include_deleted=true` is given. Create SHALL return the stored entity with its generated id and defaults.

#### Scenario: Create a task via the API
- **WHEN** a script POSTs `{"title":"Buy milk"}` to `/api/v1/tasks` with a bearer token
- **THEN** the response is 201 with the task including `id`, `priority` 4, `created_at` and `position`

#### Scenario: Patch rejects unknown fields
- **WHEN** a PATCH body contains a field that is not part of the entity schema
- **THEN** the response is 400 with code `invalid_input` and nothing changes

#### Scenario: Delete is a tombstone
- **WHEN** a DELETE succeeds
- **THEN** the response is 204, a subsequent GET of that id is 404, and the item is still present in the export with `deleted_at` set

### Requirement: Custom field values on tasks
A task SHALL carry its custom field values as a `fields` object keyed by definition id in every read, an empty object when it holds none, and SHALL accept the same object in create and patch (OpenSpec `custom-fields`); the per-field operations behind it SHALL NOT appear as separate keys.

#### Scenario: A new task has an empty fields object
- **WHEN** a script POSTs `{"title":"Buy milk"}` to `/api/v1/tasks` with a bearer token
- **THEN** the created task carries an empty `fields` object

#### Scenario: Patch a custom field value
- **WHEN** a script PATCHes `/api/v1/tasks/{id}` with `{"fields":{"<cost-id>":120}}`
- **THEN** the response is 200 with `"fields":{"<cost-id>":120}` merged into the task's existing values, one operation is recorded for that field only, and devices receive it on their next sync

#### Scenario: Unknown definition id
- **WHEN** the `fields` object names an id that is no live definition of the task's project
- **THEN** the response is 400 `invalid_input` naming the id and nothing changes

### Requirement: Write-through to the operation log
Every API write SHALL be recorded as operations stamped with server time, with device `server` for sessions and `full` tokens, `agent:<token-id>` for `agent` tokens and `public:<link-id>` for ticks through a public link (OpenSpec `public-links`), so devices receive API-originated changes on their next sync and last-writer-wins applies uniformly. Concurrent offline device edits converge with them like any other op.

#### Scenario: API write reaches devices
- **WHEN** a task is created through the API and a device syncs afterwards
- **THEN** the device receives the operations and shows the task

#### Scenario: Agent token write is attributed
- **WHEN** an `agent` token creates a task through `POST /api/v1/tasks` with both assistant switches on
- **THEN** the stored ops carry device `agent:<token-id>` and the task's history shows the assistant label

#### Scenario: Public tick is attributed
- **WHEN** a guest completes a task through a public tick link
- **THEN** the stored op carries device `public:<link-id>`, the link creator's account as actor and server time, and the task's history shows the public link label

### Requirement: Sync endpoint
`POST /api/v1/sync` SHALL accept `{device, cursor, ops}` and return `{applied, duplicates, ops, cursor, hasMore, serverTime}`. A missing device id SHALL be a 400 error. At most 1000 operations SHALL be accepted or returned per request. A request whose device, or any submitted op's device, starts with a server-reserved prefix (`agent:`, `caldav:`, `public:`) SHALL be refused with 400 `invalid_op` and nothing stored.

#### Scenario: Oversized batch
- **WHEN** a request carries more than 1000 operations
- **THEN** the response is 400 with code `invalid_op`

#### Scenario: Reserved device prefix
- **WHEN** a device submits a request with device `public:abc`, or an op whose device is `caldav:abc`
- **THEN** the response is 400 `invalid_op` and nothing is stored

### Requirement: Export
`GET /api/v1/export` SHALL return every project and task of the authenticated user, soft-deleted ones included, and their attachments' metadata as one JSON document with a format name and version, served as a download. With `format=zip` it SHALL stream a ZIP holding that document as `export.json` and each stored file the user can read under `attachments/<id>/<name>`, without buffering files in memory. Both forms require authentication.

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

### Requirement: Health endpoint
`GET /healthz` SHALL require no authentication and SHALL return 200 with the version when the database is reachable, otherwise 503.

#### Scenario: Healthy server
- **WHEN** a monitor requests `/healthz`
- **THEN** the response is 200 with `{"status":"ok","version":"<version>"}`

### Requirement: Idempotency keys on create
`POST /api/v1/{collection}` SHALL accept `Idempotency-Key` (1 to 128 characters of letters, digits and `._:-`) and derive entity and op ids from user, collection and key: 201 first, 200 with the stored entity and `Idempotent-Replayed: true` on a same-content repeat, 409 `idempotency_conflict` on other content. A replay SHALL be recognised only by the same user's stored ops, so keys never cross accounts. Retries converge on every device.

#### Scenario: Replayed create
- **WHEN** a script POSTs `{"title":"Buy milk"}` to `/api/v1/tasks` twice with `Idempotency-Key: k1`
- **THEN** the first response is 201, the second 200 with the same id and `Idempotent-Replayed: true`, and one task exists on every device after sync

#### Scenario: Conflicting reuse
- **WHEN** the same key is sent with `{"title":"Buy bread"}`
- **THEN** the response is 409 `idempotency_conflict` and the stored task is unchanged

#### Scenario: Invalid key
- **WHEN** the header holds 200 characters or a space
- **THEN** the response is 400 `invalid_input` naming `Idempotency-Key` and nothing is created

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials sends `Idempotency-Key` to `POST /api/v1/tasks`
- **THEN** the response is 401 `unauthorized` and nothing is created

#### Scenario: Read token
- **WHEN** a `read` token sends a keyed create
- **THEN** the response is 403 `insufficient_scope` and nothing is created

#### Scenario: Keys are per account
- **WHEN** two accounts each POST `{"title":"Same"}` with `Idempotency-Key: k1`, and a collaborator has planted a task under the id the first account's next key would derive
- **THEN** the two creates make two tasks, each account's repeat returns only its own task, and the first account's keyed create over the planted task answers 409 `idempotency_conflict` without changing it

### Requirement: Task list by completion time
`GET /api/v1/tasks` SHALL accept `completed_after` and `completed_before`, each a `YYYY-MM-DD` date (start of that day in the `timezone` parameter's zone, UTC by default), an RFC 3339 time or Unix milliseconds, and with either SHALL list only completed tasks completed in `[completed_after, completed_before)`. The route keeps its authentication. The parameters only filter synced rows, so offline behaviour and convergence are unchanged.

#### Scenario: Last week's completions
- **WHEN** a script requests `/api/v1/tasks?completed_after=2026-10-05&completed_before=2026-10-12&timezone=Europe/Zurich`
- **THEN** the response lists the tasks completed from 2026-10-05 00:00 to 2026-10-11 23:59 Zurich time, each with `completed_at` and `completed_by`, and no open task

#### Scenario: Invalid value
- **WHEN** a script requests `/api/v1/tasks?completed_after=last-week`, or passes `completed_after` to `/api/v1/projects`, or an unknown `timezone`
- **THEN** the response is 400 `invalid_input` naming the parameter

#### Scenario: Anonymous request
- **WHEN** the same request is sent without credentials
- **THEN** the response is 401 `unauthorized`

### Requirement: Strict JSON request bodies
A JSON request body SHALL be exactly one JSON value; anything after it but white space SHALL be refused with 400 `bad_request`. A field the route does not define SHALL be refused with 400 `bad_request` naming it, except on the sync exchange, the push subscription and passkey credentials, whose bodies may carry more. A refused body writes no op, so devices are unaffected. Without credentials a protected route still answers 401.

#### Scenario: Unknown field
- **WHEN** a client posts `{"email": "…", "password": "…", "remember": true}` to `/api/v1/auth/login`
- **THEN** the response is 400 `bad_request` with a message naming `remember` and nobody is signed in

#### Scenario: Data after the value
- **WHEN** a body holds a JSON object followed by another value
- **THEN** the response is 400 `bad_request`

#### Scenario: Newer client syncs
- **WHEN** a client sends a sync exchange whose ops carry a property this server does not know
- **THEN** the exchange is processed as before

#### Scenario: Without credentials
- **WHEN** a body with unknown fields is sent to a protected route without a session or token
- **THEN** the response is 401 `unauthorized`

### Requirement: Body size and error messages
A JSON body over the route's size limit (4 MB unless the route sets a smaller one) SHALL be refused with 413 `too_large`. Error messages about a body SHALL be the server's own plain text, never the decoder's internal wording. Nothing is written, so devices are unaffected.

#### Scenario: Body too large
- **WHEN** a JSON body is larger than the route's limit
- **THEN** the response is 413 `too_large`

#### Scenario: Wrong type
- **WHEN** a field has the wrong JSON type
- **THEN** the response is 400 `bad_request` saying which field and what type it must be, without the server's internal type names

### Requirement: Task origin on the API
`POST /api/v1/tasks` and `PATCH /api/v1/tasks/{id}` SHALL accept `origin` (the object, or `null` on patch) under the same validation as the sync path and write it through the operation log, for `full`, `admin` and `agent` tokens alike. The server SHALL derive nothing from the URL and SHALL never request it.

#### Scenario: Create with an origin
- **WHEN** a script POSTs `{"title":"Fix the login timeout","origin":{"kind":"issue","provider":"github","id":"o/r#7","url":"https://github.com/o/r/issues/7"}}` with a bearer token
- **THEN** the response is 201 and the task carries that `origin` unchanged, and a device that syncs shows the chip

#### Scenario: Invalid origin
- **WHEN** a script PATCHes `{"origin":{"kind":"url","url":"file:///etc/passwd"}}`
- **THEN** the response is 400 `invalid_input` naming `origin`, and nothing changes

#### Scenario: Anonymous request
- **WHEN** a request without credentials PATCHes a task's origin
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token cannot set it
- **WHEN** a `read` token PATCHes `{"origin":null}`
- **THEN** the response is 403 and the origin is unchanged

### Requirement: Task origin in representations
Every task representation (get, list, create response, export, webhook payloads) SHALL carry `origin`: the object, `null` when unset, or the ciphertext string for an encrypted account.

#### Scenario: Export carries it
- **WHEN** a user with a task from email requests the export
- **THEN** that task's entry carries `"origin":{"kind":"email","id":"<a1@mail.example>"}` and tasks without one carry `"origin":null`
