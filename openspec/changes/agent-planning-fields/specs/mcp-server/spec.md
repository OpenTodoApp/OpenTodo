## ADDED Requirements

### Requirement: Planning fields in write tools
`create_tasks` items and `update_tasks` updates SHALL accept `deadline` (a calendar date `YYYY-MM-DD` that exists, or null), `start` (such a date, the word `someday`, or null), `evening` (a boolean), `blocked_by` (an array of task ids) and `location` (the task location object of OpenSpec `task-locations`, or null), each written as one operation for that field through the operation log like every other field the tools write, so it converges with offline device edits by per-field last-writer-wins and shows in the task's history under the assistant. The tools SHALL write exactly what is sent, as the REST API does: parking a task in Someday does not clear its `due`, and a start date does not move it. A `blocked_by` list SHALL hold at most 50 distinct ids, never the task's own id, only tasks the caller can see in the same sharing scope as the task (after the call's own moves and creates), and SHALL NOT make any task wait for itself through the lists the call leaves behind; an unknown or invisible id SHALL be the tool error `not_found` listing it, and a self-reference, a foreign scope or a cycle SHALL be a JSON-RPC `-32602` error naming the item, the field and the offending id. An invalid date, start word, evening value or location SHALL be a `-32602` error naming the item and the field. Any refusal SHALL change nothing.

#### Scenario: Defer and set a deadline in one update
- **WHEN** an allowed assistant calls `update_tasks` with `[{"id": "<report>", "start": "2026-11-03", "deadline": "2026-11-06"}]`
- **THEN** the task starts on 3 November and is due by 6 November on every device after sync, its `due` is unchanged, and its history shows both changes under the assistant

#### Scenario: Park five tasks in Someday
- **WHEN** an allowed assistant calls `update_tasks` with five updates that each set `start: "someday"`
- **THEN** all five leave Today, Upcoming and the Inbox on every device, keep their due dates as stored, and the result lists each as `updated`

#### Scenario: Create a waiting-for task
- **WHEN** an allowed assistant calls `create_tasks` with one item `{"title": "Install shelves", "project_id": "<home>", "blocked_by": ["<order-parts>"]}` where "Order parts" is an open task of the same project
- **THEN** the task is created blocked, the result lists its id, and devices show it dimmed as waiting for "Order parts" after sync

#### Scenario: Blocker in another scope
- **WHEN** an assistant calls `update_tasks` with `blocked_by` naming an Inbox task for a task in a shared project
- **THEN** the response is a `-32602` error naming the item, `blocked_by` and that id, and nothing changes

#### Scenario: Cycle through the call
- **WHEN** an assistant calls `update_tasks` with two updates, A waiting for B and B waiting for A
- **THEN** the response is a `-32602` error naming the cycle and neither task changes

#### Scenario: Unknown blocker
- **WHEN** an assistant calls `update_tasks` with `blocked_by` naming a deleted task or a task of another account
- **THEN** the result is the tool error `not_found` listing the id, without distinguishing the two, and nothing changes

#### Scenario: Invalid date and word
- **WHEN** an assistant calls `create_tasks` with `deadline: "next friday"` or `start: "later"`
- **THEN** the response is a `-32602` error naming the item and the field, and no task is created

#### Scenario: Set a location by saved location
- **WHEN** an allowed assistant calls `update_tasks` with `location: {"place_id": "<gym>"}` where Gym is one of the user's saved locations
- **THEN** the task's location is written as one value holding the saved location's current name, address and coordinates plus its `place_id`, and the task panel shows it on the Where line after sync

#### Scenario: Invalid location
- **WHEN** an assistant sends `location: {"lat": 91, "lon": 9}` or `location: {}`
- **THEN** the response is a `-32602` error naming the item and `location`, and nothing changes

#### Scenario: Viewer role refuses the batch
- **WHEN** the assistant of a viewer in a shared project calls `update_tasks` setting a deadline on one task there and one in the user's own project
- **THEN** nothing is applied and the tool error lists the shared task as `forbidden`

#### Scenario: Deadline reminders follow
- **WHEN** an assistant changes the deadline of a task that has a reminder relative to its deadline
- **THEN** the reminder's firing time is recomputed in the same batch, as a REST write of `deadline` does, and the task's due-relative reminders are untouched

### Requirement: Planning fields in tool results
Task results of the read tools, the write tools, the agent REST responses and the `opentodo://` task, project and view resources SHALL carry `deadline` (`null` when unset), `start` (`null`, a date or `someday`), `evening`, `blocked_by` (the stored ids, empty when none), `blocked` (true while the task is open and any task it waits for is open and not deleted) and `location` (`null` when unset): a location's `name` and `address` SHALL sit inside the untrusted-text marking like the task title, its coordinates and `place_id` outside it, and a location linked to one of the user's saved locations SHALL show that saved location's current values. For an end-to-end encrypted account `location` SHALL be `null` and the task SHALL carry `encrypted: true`, never the ciphertext, while the four plaintext planning fields SHALL be shown.

#### Scenario: Fields in a read
- **WHEN** an assistant calls `get_task` on a task that starts on 3 November, is due by 6 November, is marked for the evening and waits for an open task
- **THEN** the result carries `start: "2026-11-03"`, `deadline: "2026-11-06"`, `evening: true`, the blocker's id in `blocked_by` and `blocked: true`

#### Scenario: Blocker completed
- **WHEN** the blocker of that task is completed on a device and the assistant reads the task again after the device synced
- **THEN** `blocked_by` still lists the blocker's id and `blocked` is false

#### Scenario: Location in a read
- **WHEN** an assistant calls `get_task` on a task located at "Mum's, Via Roma 1, Torino"
- **THEN** the result's `untrusted_text.location` holds the name and address, and `location` holds the coordinates and, when linked, the `place_id`

#### Scenario: Encrypted account
- **WHEN** an assistant reads a task of an end-to-end encrypted account that has a location and a deadline
- **THEN** the result carries `location: null`, `encrypted: true` and the deadline in plain text

### Requirement: Open Loops views and the blocked filter
`list_tasks` SHALL accept the views `someday` (open tasks parked in Someday) and `anytime` (open tasks neither scheduled nor parked, as the app's Anytime view lists them), and a boolean `blocked` filter (`true`: only blocked tasks, `false`: only unblocked ones) combinable with every other filter and view; `resources/list` SHALL expose `opentodo://views/someday` and `opentodo://views/anytime` built from the same reads. The membership rules SHALL be those of the app's views, pinned by the shared vectors the app and the server already share, and the results SHALL reflect only what devices have synced.

#### Scenario: Waiting list
- **WHEN** an assistant calls `list_tasks` with `blocked: true` and `project_id` of "Launch"
- **THEN** the result lists the open tasks of "Launch" that wait for an open task, each with `blocked: true` and its `blocked_by`

#### Scenario: Someday view
- **WHEN** an assistant calls `list_tasks` with `view: "someday"`
- **THEN** the result lists the user's open tasks with `start: "someday"` and nothing else, paged like every list

#### Scenario: Invalid view
- **WHEN** `list_tasks` is called with `view: "later"`
- **THEN** the response is a JSON-RPC `-32602` error naming the allowed views

### Requirement: Location on encrypted accounts
For an end-to-end encrypted account the `location` argument of `create_tasks` and `update_tasks` SHALL be a content argument: offered as ciphertext only, accepted as a well-formed ciphertext envelope stored unchanged, and refused as plaintext with the tool error `encryption_enabled`, exactly as titles are. `deadline`, `start`, `evening` and `blocked_by` SHALL be accepted in plain form for every account and converge with offline device edits by last-writer-wins.

#### Scenario: Plaintext location refused
- **WHEN** an allowed assistant of an encrypted account calls `update_tasks` with `location: {"name": "Gym"}`
- **THEN** the result is the tool error `encryption_enabled` and nothing is written

#### Scenario: Planning fields still work
- **WHEN** the same assistant calls `update_tasks` with `start: "someday"` and `deadline: "2026-11-06"` on two tasks
- **THEN** both are written in plain form and every enrolled device shows them after sync with titles still encrypted

#### Scenario: Ciphertext location stored as given
- **WHEN** a client encrypting on the user's machine calls `update_tasks` with a `location` that is a well-formed `enc:v1:` envelope
- **THEN** the envelope is stored unchanged and an unlocked device shows the location it decrypts to
