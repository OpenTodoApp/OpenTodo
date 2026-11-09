# Spec Delta

## MODIFIED Requirements

### Requirement: Assistant turn route
`POST /api/v1/assistant/turn` SHALL require a session (bearer tokens get 403 `session_required`), accept a conversation of at most 40 messages and 256 KB, allow one turn per user at a time (409 `turn_in_progress`) and at most 8 server-wide (503 `assistant_busy`), and stream text, status, block, change-set, usage and done events. It writes nothing; it reads synced data only. In host mode the 8 SHALL be shared by all of the host's tenants, not counted per tenant, so the operator's provider keys see at most 8 turns however many tenants are open.

#### Scenario: Streamed answer
- **WHEN** a consented user asks "what is due today?"
- **THEN** the response streams text events listing today's tasks, then a usage event and a done event with `end_turn`

#### Scenario: Block event
- **WHEN** a consented user asks "show me what's overdue" and the model calls `show_tasks` with three task ids
- **THEN** the response streams a block event of kind `tasks` with those three ids and no task titles, between the text events before and after the call

#### Scenario: Token refused
- **WHEN** a script calls the route with a `full` API token
- **THEN** the response is 403 `session_required` and no provider request is made

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls the route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Too large
- **WHEN** the conversation has 41 messages or exceeds 256 KB
- **THEN** the response is 413 `too_large` and no provider request is made

#### Scenario: Concurrent turn
- **WHEN** a user starts a second turn while the first is streaming
- **THEN** the second answers 409 `turn_in_progress`

#### Scenario: Host-wide limit
- **WHEN** a host serves two tenants, 8 assistant turns are running across them and a person in either tenant starts a turn
- **THEN** the answer is 503 `assistant_busy` with `Retry-After` and no provider request is made; once one of the running turns ends, a turn in either tenant can start

### Requirement: Reviewable change sets
The panel and the Assistant page SHALL show a proposed change set as a card: a head naming it, the number of checked items out of all ("3 of 4 selected") and that nothing changes until the user applies; the items in a shape; and a foot with an apply action naming how many changes it applies ("Apply 3 changes"), Discard, and the keys. It SHALL apply only after confirmation (Enter or the apply action) or discard it (Esc or Discard). Items whose local value changed since the proposal SHALL be unchecked and marked; items missing locally SHALL be dropped with a note. Review and apply work offline once the proposal has arrived; applied changes converge as ops.

The shapes are:
- **List**: one row per task or project with a checkbox, the title and each change in words (old → new), at the right of a wide card and under the title of a narrow one, with shared items marked.
- **Calendar**: chosen when at least two items change a do-on date, a start date or a deadline, all of them to dates within 7 consecutive days. The affected days show with the user's existing dated tasks, and the proposed items appear marked as proposed at their new dates and times.
- **Outline**: chosen when the change set creates a project. That project, its sections and its new tasks show as a tree.
- **Map**: chosen when every item sets a place, while maps are on.

Otherwise the card SHALL use the list. Every item SHALL keep its checkbox in every shape, checked by default. A switch in the card's head SHALL toggle between the chosen shape and the list, and the list SHALL always be reachable.

Before applying, the user SHALL be able to edit a checked item's proposed title (for a created task or project), its proposed do-on date, start date or deadline, and its proposed priority. The edited value SHALL be what applies. The item SHALL be marked "edited", and an edited value SHALL pass the same checks as the same field typed in the app. Editing never adds a field the proposal did not touch.

#### Scenario: Review and apply part
- **WHEN** a change set proposes 5 changes and the user unchecks one and presses Enter
- **THEN** exactly the 4 checked changes are applied and the summary says 4 of 5 were applied

#### Scenario: Changed since proposed
- **WHEN** another device changed a task's due date after the proposal arrived and before the user applies
- **THEN** that item is unchecked and marked "changed since proposed", and applying leaves the newer value in place

#### Scenario: The card counts the selection
- **WHEN** a change set proposes 4 changes, one of them changed since proposed
- **THEN** the head reads "3 of 4 selected" and the apply action reads "Apply 3 changes"; unchecking another item makes them "2 of 4 selected" and "Apply 2 changes"

#### Scenario: A week plan shows as a calendar
- **WHEN** a change set moves 6 tasks to dates between Monday and Friday of next week
- **THEN** the card shows those five days with the existing dated tasks and the 6 proposed items marked as proposed, and "Show as list" switches to the list with the same 6 checked items

#### Scenario: A new project shows as an outline
- **WHEN** a change set creates the project "Move flat" with two sections and 9 tasks
- **THEN** the card shows "Move flat" with its two sections and their tasks as a tree, each task with a checkbox

#### Scenario: Edit before applying
- **WHEN** a change set proposes a new task "Call landlord" due Friday, and the user edits the title to "Call landlord about deposit" and the date to Thursday, then applies
- **THEN** the task is created with the edited title and Thursday, the item was marked "edited", and Undo moves it to the Trash

#### Scenario: Edited offline
- **WHEN** the user edits and applies a proposed item while offline, and another device later changes the same task's priority
- **THEN** the edited fields apply locally at once, sync later, and both devices converge by last writer per field
