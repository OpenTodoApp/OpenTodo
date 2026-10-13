## ADDED Requirements

### Requirement: List of assistant write calls
`GET /api/v1/me/agent-calls` SHALL list the caller's own assistant write calls of the last 30 days, newest first, at most 50 per page with a cursor, optionally for one token. A call is the ops of one `agent:<token-id>` device at one server timestamp. Each entry SHALL carry its id, time, token, tools when the audit log still has them, counts of changed items, project ids and undo status. It is derived from synced ops and needs a connection.

#### Scenario: Calls listed per token
- **WHEN** Alice's token "Desk assistant" made a `complete_tasks` call for 3 tasks and a `create_tasks` call for 2 tasks today, and Alice requests the list
- **THEN** two entries are returned, newest first, naming "Desk assistant", the tools, `completed: 3` and `created: 2`, and the projects touched

#### Scenario: Revoked token still listed
- **WHEN** Alice revoked the token after its calls
- **THEN** its calls of the last 30 days are still listed and can be undone, with the token shown as deleted

#### Scenario: Older than the window
- **WHEN** a call was made 31 days ago
- **THEN** it is not listed

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls `GET /api/v1/me/agent-calls`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Agent token refused
- **WHEN** an `agent` token calls `GET /api/v1/me/agent-calls`
- **THEN** the response is 403 `insufficient_scope` and nothing is listed

### Requirement: Undo an assistant's write calls
`POST /api/v1/me/agent-calls/undo` with call ids, or with a token id and a start time, SHALL write the inverse of those calls as one batch with `ApplyStrict` as the caller, device `agent-undo:<token-id>` and a new server timestamp, then wake devices. Changed fields return to the value they would have without those calls, created items move to the Trash, trashed tasks are restored and added comments are deleted. `dry_run: true` SHALL report the same result and write nothing.

#### Scenario: Undo a reschedule
- **WHEN** an assistant moved 12 tasks to Friday in one `schedule_tasks` call and the user undoes that call
- **THEN** the 12 tasks have their previous due dates, the response lists 12 restored items and no skipped ones, and every device shows the old dates after sync

#### Scenario: Undo created tasks and a comment
- **WHEN** the undone call created 3 tasks and another call being undone added a comment
- **THEN** the 3 tasks are in the Trash and restorable, and the comment is deleted

#### Scenario: Undo a recurring completion
- **WHEN** an assistant completed the current occurrence of a weekly task and the user undoes that call
- **THEN** the series has its previous due date again and the completed occurrence record is in the Trash

#### Scenario: Undo everything from one token
- **WHEN** the user undoes token "Desk assistant" since 24 hours ago, covering 5 calls
- **THEN** one batch restores the values from before the first of those calls on every field no one else changed since

#### Scenario: Dry run
- **WHEN** the user sends the same request with `dry_run: true`
- **THEN** the response lists what would be restored and skipped and no op is written

#### Scenario: Unknown or foreign call
- **WHEN** the request names a call id of another account or one that does not exist
- **THEN** the response is 404 `not_found` without distinguishing the two, and nothing is written

#### Scenario: Unauthenticated undo
- **WHEN** a request without credentials sends `POST /api/v1/me/agent-calls/undo`
- **THEN** the response is 401 `unauthorized`

### Requirement: Undo never overwrites later changes
Undo SHALL skip, and report with item and reason, any field whose current value was written after the call by anyone or anything other than the calls being undone (`changed_since`), an item created by the call that someone has worked with since, an item the caller can no longer edit (`forbidden`) or see (`not_accessible`), a purged item, and any plaintext that would go into a content field of an encrypted account. Undoing the same call again SHALL write nothing (`already_undone`).

#### Scenario: Hand edit after the assistant
- **WHEN** the user changed one of the 12 rescheduled tasks' due date by hand before undoing
- **THEN** that task keeps the hand-edited date and is reported as skipped with `changed_since`, while the other 11 are restored

#### Scenario: Viewer by now in a shared project
- **WHEN** the assistant completed tasks in a shared project where the user has since become a viewer
- **THEN** those tasks are skipped with `forbidden`, the user's other tasks in the call are restored, and the batch is not refused

#### Scenario: Created task that a person worked with
- **WHEN** the assistant created a task and another member added a subtask to it before the undo
- **THEN** the task stays and is reported as skipped with `changed_since`

#### Scenario: Undo twice
- **WHEN** the user undoes a call and then undoes the same call again
- **THEN** the second request writes no op and reports every item as `already_undone`

#### Scenario: Encrypted account
- **WHEN** the assistant of an encrypted account rescheduled tasks and the user undoes the call
- **THEN** the plaintext due dates are restored, no content field is written, and the titles stay ciphertext on the server

### Requirement: Undo is an ordinary convergent edit
Undo SHALL be online-only. Its ops SHALL converge with device edits by last-writer-wins like any server write: an edit with a later timestamp wins over the undo, and an offline edit made before the undo but synced after it loses on the fields the undo wrote while staying in history. Undo SHALL never remove ops from the log. `/api/v1/sync` SHALL refuse submitted ops whose device starts with `agent-undo:`.

#### Scenario: Later offline edit wins
- **WHEN** the user undoes a call while a laptop, offline, changes one of the restored tasks' priority after the undo time, and the laptop syncs later
- **THEN** every device shows the laptop's priority and the undo's other restored fields

#### Scenario: Earlier offline edit synced after the undo
- **WHEN** a phone changed a restored task's due date offline before the undo and syncs only afterwards
- **THEN** every device shows the undo's due date and the phone's change is listed in the task's history

#### Scenario: Forged undo device
- **WHEN** a device submits ops to `/api/v1/sync` with device `agent-undo:abc`
- **THEN** the request is refused with 400 `invalid_op` and nothing is applied

#### Scenario: Offline panel
- **WHEN** the device is offline and the user opens the list of assistant changes
- **THEN** the last fetched list is shown and every undo action is disabled with a note that a connection is needed

### Requirement: Who may undo and how much
Only the user whose token made a call SHALL list or undo it, with a session or a `full` token; `read` and `agent` tokens SHALL be refused with 403 `insufficient_scope`, and no MCP tool or agent REST route SHALL undo. One request SHALL cover at most 100 calls and 500 items, else 400 `too_many_items`. A user SHALL make at most 10 undo requests per minute, else 429 `rate_limited` with `Retry-After`. Each request SHALL be audited as `agent.undo`.

#### Scenario: Read token refused
- **WHEN** a `read` token sends `POST /api/v1/me/agent-calls/undo`
- **THEN** the response is 403 `insufficient_scope` and nothing is written

#### Scenario: Assistant cannot undo
- **WHEN** an `agent` token sends `POST /api/v1/me/agent-calls/undo` or an MCP client calls `tools/list`
- **THEN** the POST is refused with 403 `insufficient_scope` and no undo tool is listed

#### Scenario: Too many items
- **WHEN** an undo since 30 days ago would change 800 items
- **THEN** the response is 400 `too_many_items` stating the count and the limit of 500, and nothing is written

#### Scenario: Too many requests
- **WHEN** a user sends an 11th undo request within one minute
- **THEN** the response is 429 `rate_limited` with a `Retry-After` header and nothing is written

#### Scenario: Demo instance
- **WHEN** a demo account calls `POST /api/v1/me/agent-calls/undo`
- **THEN** the response is 403 `demo_restricted`

### Requirement: Recent assistant changes in Settings
The AI assistants section SHALL show "Recent changes by assistants", grouped by token, each call with time, tools, a summary of items and projects, and its undo status, with "Undo" per call and "Undo all from this assistant" for the last hour, 24 hours, 7 days or 30 days. Each SHALL open a preview listing what will be restored and what will be skipped with reasons before anything is written. It SHALL work with the keyboard.

#### Scenario: Undo one call from Settings
- **WHEN** the user presses Undo on a call, reviews the preview "Will restore 12 items, 1 skipped" and confirms
- **THEN** the items are restored, a message summarises the result naming the skipped task, and the row shows "Partly undone"

#### Scenario: Undo all after revoking a token
- **WHEN** the user revoked a misbehaving token and chooses "Undo all from this assistant" for the last 24 hours
- **THEN** the preview covers every call of that token in the period and confirming undoes them in one step

#### Scenario: Encrypted project names
- **WHEN** an encrypted account opens the panel on an unlocked device
- **THEN** project names in the summaries are the decrypted local names, and the server response carried no readable names
