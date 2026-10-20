# Spec Delta

## ADDED Requirements

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
