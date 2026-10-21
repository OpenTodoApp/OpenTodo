## ADDED Requirements

### Requirement: Quick-add parse route
`POST /api/v1/quick-add/parse` SHALL take `{line, url?, today?, now?}` and answer `200 {title, fields, chips, unmatched, origin}`: `fields` the task fields the line sets under the quick-add grammar (`due`, `deadline`, `start`, `evening`, `project_id`, `labels` as `{id?, name}` with `id` absent for a label that does not exist yet, `priority`, `estimate_minutes`, `spent_minutes`, `recurrence`, `reminders`), `chips` the preview chips in the account's interface language with their text and the span of the line they come from, `unmatched` the `#name` tokens that name no project, and `origin` the recognised origin of `url` (an `issue` origin for a recognised tracker link, else a `url` origin) or `null` without a `url`. Parsing SHALL use the account's quick-add languages, date order and week start, and the account's non-deleted projects and labels; `today` and `now` (the caller's local date and time) SHALL default to the server's clock in the zone the account's devices last reported. The route SHALL be deterministic and SHALL write nothing. It SHALL accept a session and every token scope, including `read`, since it changes nothing. A `line` over 2,000 characters or a body that is not an object SHALL be refused with `400 invalid_input`; more than 60 requests a minute per account SHALL be refused with `429 rate_limited`. The result SHALL match the web parser and the command-line client for the same line and context, pinned by the shared quick-add vectors.

#### Scenario: Parse with the account's projects
- **WHEN** an account with a project "Home" and German as its first quick-add language POSTs `{"line":"Heizung entlüften morgen 9 Uhr #Home p1 @call"}` with a bearer token
- **THEN** the response is 200 with `title` "Heizung entlüften", `fields.due` tomorrow at 09:00, `fields.project_id` the id of Home, `fields.priority` 1, `fields.labels` `[{"name":"call"}]` (no id, the label does not exist), and chips reading the date and the project in German

#### Scenario: Recognised origin
- **WHEN** the body carries `"url":"https://github.com/o/r/issues/7"`
- **THEN** `origin` is `{"kind":"issue","provider":"github","id":"o/r#7","url":"https://github.com/o/r/issues/7"}` and the server made no request to that address

#### Scenario: Read token accepted
- **WHEN** a `read` token POSTs a line
- **THEN** the response is 200 and nothing has changed on the account

#### Scenario: Anonymous request
- **WHEN** a request without credentials POSTs a line
- **THEN** the response is 401 `unauthorized`

#### Scenario: Over-long line
- **WHEN** the line is 3,000 characters long
- **THEN** the response is 400 `invalid_input` naming `line`

#### Scenario: Rate limit
- **WHEN** an account sends its 61st parse request within a minute
- **THEN** the response is 429 `rate_limited`, and requests are accepted again in the next window

#### Scenario: Same result as the app
- **WHEN** every line of the shared quick-add vectors is sent with each vector's context
- **THEN** the fields answer equals the vector's expected result
