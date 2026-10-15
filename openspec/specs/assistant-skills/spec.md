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
