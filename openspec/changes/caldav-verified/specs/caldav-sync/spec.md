## MODIFIED Requirements

### Requirement: Real-client verification
The CalDAV documentation SHALL carry a verification table with one row per client and one column per behaviour of this capability. The clients are Apple Reminders on iOS and macOS, Thunderbird, DAVx⁵ with Tasks.org, DAVx⁵ with jtx Board, and Mitra. The behaviours are due forms, deadline mapping, inbound date shapes, estimates, alarms both ways, recurrence completion, moves, deletion, incremental sync and subtask hierarchy. Each row SHALL name the client version and platform, and each cell SHALL state the date and one of these results:
- `works`, with notes;
- `not supported by <client>`, with the reason;
- `defect #<issue>`;
- `not verified`.

A behaviour a client cannot support SHALL say so in its cell rather than be left blank. A cell SHALL say `works` only when the step was performed on that client version following the scripted scenario in `docs/caldav-verification.md`, and the requests the client sent are kept as sanitised fixtures under `internal/caldav/testdata/<client>-<version>/` and pinned by a test. A release tagged 1.0 or later SHALL have no `not verified` cell in the Apple Reminders, Thunderbird and DAVx⁵ rows, and a repository check SHALL fail when it does or when a row names no client version.

#### Scenario: Table present
- **WHEN** a reader opens the CalDAV guide
- **THEN** they find the verification table with every client and every behaviour, and no cell is blank

#### Scenario: Unverified behaviour is honest
- **WHEN** a behaviour has not been exercised against a client
- **THEN** its cell says "not verified" with the date of the last attempt, and the guide does not claim it works there

#### Scenario: A verified cell is pinned
- **WHEN** a contributor changes the inbound mapping so that a recorded Tasks.org PUT from the verification run would set a different due date
- **THEN** the client fixture test fails and names the client, the fixture and the field

#### Scenario: Release gate
- **WHEN** the repository checks run on a tree whose version is 1.0.0 and the DAVx⁵ + Tasks.org row still has a `not verified` cell
- **THEN** the check fails and names the row and the column

#### Scenario: Unsupported behaviour
- **WHEN** a client has no way to set an alarm on a task
- **THEN** the alarms cell says `not supported by <client>` with the reason, and the release gate accepts it

## ADDED Requirements

### Requirement: Subtask hierarchy with real clients
Subtasks SHALL round-trip through CalDAV three levels deep. A VTODO with `RELATED-TO;RELTYPE=PARENT` or an untyped `RELATED-TO` naming a task of the same calendar SHALL become a subtask of that task. A subtask SHALL be served with its parent's UID in an untyped `RELATED-TO` line. A parent moved to another calendar from a client SHALL keep its children, which move with it on the next sync, as a move inside the app does. The writes are ordinary operations: offline devices receive them on their next sync and `parent_id` converges by last-writer-wins.

#### Scenario: Three levels from Tasks.org
- **WHEN** a Tasks.org user creates a task, a subtask under it and a sub-subtask under that, and DAVx⁵ syncs
- **THEN** the app shows the same three-level hierarchy after the devices' next sync

#### Scenario: Hierarchy served to a client
- **WHEN** a task with two subtasks, one of which has its own subtask, is fetched by DAVx⁵
- **THEN** each subtask carries a `RELATED-TO` line with its parent's UID and Tasks.org shows them nested

#### Scenario: Parent in another calendar
- **WHEN** a client PUTs a VTODO whose `RELATED-TO` names a UID that lives in a different calendar of the same account
- **THEN** the relation is kept in `ical_extra` and served back unchanged, and `parent_id` is not changed

#### Scenario: Unauthenticated write
- **WHEN** a PUT carrying a `RELATED-TO` line arrives without valid app-password credentials
- **THEN** the response is 401 and no task changes

### Requirement: Large-account budgets
CalDAV requests on an account of 10,000 tasks across 20 calendars SHALL stay within these budgets, checked by a Go test that seeds the account through the operation log from a fixed seed:

| Request | Gate | Ceiling |
|---|---|---|
| PROPFIND Depth 1 of a 500-task calendar | allocations per resource at most 1.5 times the 50-task case | 1 s |
| plain calendar-query of a 500-task calendar | each task encoded once | 1.5 s |
| `sync-collection` with a token taken before one change | exactly one changed response element; allocations within 10 % of the same request on a 1,000-task account | 100 ms |
| calendar-multiget of 500 hrefs | cost per href does not grow with the account | 1.5 s |
| PROPFIND Depth 1 of the calendar home | no task encoded | 200 ms |

The test SHALL fail when a gate or a ceiling is exceeded and SHALL print the measured values. Responses SHALL be the same as on a small account.

#### Scenario: Incremental sync on a large account
- **WHEN** a client holding a sync token of a 500-task calendar in a 10,000-task account asks for changes after one task was renamed
- **THEN** the response lists exactly that task with its new ETag and a new sync token, within the budget

#### Scenario: Regression caught
- **WHEN** a change makes `sync-collection` encode every task of the calendar
- **THEN** the large-account test fails and names the request and the measured allocations

#### Scenario: Wrong token
- **WHEN** a client sends a `sync-collection` with a token the server never issued
- **THEN** the response is the `valid-sync-token` precondition error, as before, and no task is encoded
