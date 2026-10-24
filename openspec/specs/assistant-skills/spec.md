# assistant-skills Specification

## Purpose
Packages common planning workflows as named skills the assistant runs on the user's tasks, so people get value from the assistant without knowing what to ask, while every change it proposes stays reviewable and reversible.

## Requirements

### Requirement: Built-in skill catalogue
The server SHALL offer these built-in skills, each with a stable id, a name, a one-line description and an example prompt:
- `idea-to-project` (Turn an idea into a project)
- `plan-week` (Plan my week)
- `weekly-review` (Weekly review)
- `triage-inbox` (Triage my inbox)
- `break-down` (Break this down)

Skill ids SHALL be added but never renamed or reused.

#### Scenario: Stable ids
- **WHEN** a later version adds a skill
- **THEN** the five ids above keep their meaning, and clients that know only them keep working

### Requirement: Skill list route
`GET /api/v1/assistant/skills` SHALL list the built-in skills with id, name, description and example prompt for a signed-in user. It SHALL return an empty list when the assistant is not available to that user, and 401 without authentication.

#### Scenario: Listing skills
- **WHEN** a signed-in user for whom the assistant is available requests the skill list
- **THEN** the five skills are returned with id, name, description and example prompt

#### Scenario: Assistant unavailable
- **WHEN** the assistant is disabled or the account uses end-to-end encryption
- **THEN** the list is empty

#### Scenario: Not signed in
- **WHEN** the skill list is requested without a session or token
- **THEN** it is answered 401 with the standard error envelope

### Requirement: What a skill may do
Each skill SHALL define its instructions, the subset of the assistant's tools it may use, and the form of its result: either a proposed change set or a read-only answer. A skill SHALL never use a tool outside its subset, and SHALL never gain a permission the user or their assistant does not already have.

#### Scenario: Read-only skill cannot write
- **WHEN** a skill defined as read-only is run and the model asks to call a write tool
- **THEN** the call is refused as unavailable and no change set is proposed

#### Scenario: Write skill still reviewed
- **WHEN** the weekly review skill proposes rescheduling 12 tasks and trashing 3
- **THEN** the user sees one change set of 15 entries to review, and nothing changes until they confirm

### Requirement: Running a skill
A turn SHALL accept an optional skill id together with the user's message. The skill's instructions SHALL be applied by the server on top of the assistant's fixed instructions, and the user's message and pasted text SHALL be treated as input to the skill, never as a replacement for its instructions. An unknown skill id SHALL be refused with 400 `unknown_skill`, and a turn without a signed-in session SHALL be refused as any assistant turn is.

#### Scenario: Turn an idea into a project
- **WHEN** a user runs `idea-to-project` with "Plan a garden makeover in spring, budget 2000"
- **THEN** the assistant proposes one new project with sections and tasks with estimates, as one change set within the 50-entity limit

#### Scenario: Unknown skill
- **WHEN** a turn names the skill id `export-everything`
- **THEN** it is answered 400 `unknown_skill` and no model request is made

#### Scenario: Bearer token
- **WHEN** a turn with a skill id is sent with an API token instead of a session
- **THEN** it is answered 403 `session_required`, as for any assistant turn

### Requirement: Planning within the user's day
The `plan-week` skill SHALL receive the device's working-day settings (day start, day end and planned hours per day) with the turn and SHALL NOT propose more planned time on a day than those settings allow. Tasks without an estimate SHALL be planned with a default duration stated in the answer.

#### Scenario: Full day
- **WHEN** the user's planned day is 8 hours and Tuesday already holds 7 hours of estimated tasks
- **THEN** the proposal adds at most 1 hour of work to Tuesday and moves the rest to other days

### Requirement: Skill results behave like any change set
Changes proposed by a skill SHALL be reviewed, applied, undone, limited and audited exactly like other assistant change sets: applied locally first through operations, usable offline once proposed, converging with concurrent edits by last-writer-wins, and undoable in one step.

#### Scenario: Offline after proposing
- **WHEN** the triage skill proposed a change set and the device goes offline before the user confirms it
- **THEN** confirming applies the changes locally, and they reach the server and other devices on the next sync

### Requirement: Skills plan with the planning fields
The built-in skills SHALL use the planning fields where the method calls for them: `plan-week` SHALL set a start date for work that begins later in the week and a deadline when the user names one, and SHALL NOT give a do-on date to a task only to keep it visible; `weekly-review` SHALL propose `blocked_by` for tasks that wait for another task (Waiting), `start` for tasks that belong to Later, and `start: "someday"` for tasks the user wants to keep without a date; `triage-inbox` MAY defer or park a task instead of leaving it in the Inbox. A skill SHALL never use a tool outside its subset, and the registry SHALL leave every project kept away from AI assistants out of every skill's reads and writes.

#### Scenario: Plan-week defers instead of dating
- **WHEN** the plan-week skill runs on a week with 20 open tasks and the day budget fits 12
- **THEN** the proposal gives do-on dates to at most what the days allow and proposes start dates for the rest, with no task scheduled past its deadline

#### Scenario: Weekly review names what waits
- **WHEN** the weekly-review skill finds a task whose description says "after the parts arrive" and an open task "Order parts" in the same project
- **THEN** the proposal sets `blocked_by` to "Order parts" on that task rather than a new due date

#### Scenario: Excluded project stays out of a skill
- **WHEN** the weekly-review skill runs while "Client X" is kept away from assistants
- **THEN** none of its tasks are read, mentioned or changed, and the review's project walk does not name "Client X"

### Requirement: Skills as starters
The Assistant page and the panel's empty state SHALL offer at most three skills as starter cards, in this order: `plan-week`, `triage-inbox`, `idea-to-project`, each with its name and description from the skill list. A skill the server does not list SHALL be left out, and no card SHALL be shown when the list is empty. Choosing a card SHALL choose that skill in the composer exactly as the Skills menu does. The cards need no request of their own and work from the cached skill list offline.

#### Scenario: The three starters
- **WHEN** the server lists all five built-in skills and the user opens the Assistant page with no conversation
- **THEN** the cards read Plan my week, Triage my inbox and Turn an idea into a project, in that order

#### Scenario: A skill missing from the list
- **WHEN** the skill list holds `idea-to-project`, `plan-week` and `weekly-review` only
- **THEN** two cards are shown, Plan my week then Turn an idea into a project

#### Scenario: Assistant unavailable
- **WHEN** the skill list is empty because the assistant is not available to the user
- **THEN** no starter card is shown
