## ADDED Requirements

### Requirement: Habit skills
`start-habit` SHALL turn a sentence ("I want to read more") into a proposal of one habit: a title, a calendar rule, a tiny version, an anchor and a part of the day, which the user edits and applies or discards like any proposal, with one Undo. `habit-check` SHALL answer from `list_habits` and `get_habit` only: it SHALL quote the computed numbers and the user's check-in notes and name patterns it can show from the day states (such as the weekday a habit is most often missed), SHALL never state a number the tools did not return, and SHALL write nothing unless the user then asks for a change, which is proposed. Neither skill SHALL be offered while the user's Habits preference is off; both SHALL be offered while it is on or not decided, and applying a `start-habit` proposal SHALL turn Habits on as **Track as a habit** does. The in-app assistant SHALL not suggest habits on its own initiative while Habits is off.

#### Scenario: Start a habit
- **WHEN** the user runs Start a habit with "I want to read more in the evening"
- **THEN** the proposal shows "Read" with `every day`, the tiny version "One page", the anchor "After dinner" and This Evening, and nothing is created until the user applies it

#### Scenario: How are my habits
- **WHEN** the user runs How are my habits? and Read was missed on four of the last five Fridays
- **THEN** the answer gives Read's kept and strength as the tools returned them and says Fridays are the usual miss, with the Friday dates

#### Scenario: Habits off
- **WHEN** the user's Habits preference is off
- **THEN** the skill list shows neither habit skill

### Requirement: The capture skill logs habits
While Habits is on, the `capture` skill SHALL read check-ins in what the user typed, spoke or photographed ("ran 5k, drank water, skipped reading yesterday") and propose them as `log_habit` changes on the matching habits, with the date, the state and the rest of the sentence as the note, next to any tasks it proposes. A phrase that matches no habit SHALL stay a task proposal. The proposal SHALL be reviewed and applied with one Undo like any other.

#### Scenario: One sentence, three check-ins
- **WHEN** the user captures "ran 5k this morning, knee sore, read before bed, skipped stretching" and has the habits Run, Read and Stretch
- **THEN** the proposal holds Run done today with the note "5k, knee sore", Read done today and Stretch skipped today, and nothing is written until it is applied

## MODIFIED Requirements

### Requirement: Built-in skill catalogue
The server SHALL offer these built-in skills, each with a stable id, a name, a one-line description and an example prompt:
- `idea-to-project` (Turn an idea into a project)
- `plan-week` (Plan my week)
- `weekly-review` (Weekly review)
- `triage-inbox` (Triage my inbox)
- `break-down` (Break this down)
- `capture` (Turn this into tasks)
- `start-habit` (Start a habit)
- `habit-check` (How are my habits?)

Skill ids SHALL be added but never renamed or reused.

#### Scenario: Stable ids
- **WHEN** a later version adds a skill
- **THEN** the six ids above keep their meaning, and clients that know only them keep working

#### Scenario: Older client
- **WHEN** a client that knows only the first five ids reads the list
- **THEN** it shows `capture` with the name and description the server sends and keeps working

#### Scenario: Habit skills added
- **WHEN** a client that knows only the first six ids reads the list
- **THEN** it shows `start-habit` and `habit-check` with the names and descriptions the server sends and keeps working
