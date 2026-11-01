## ADDED Requirements

### Requirement: Which tasks a routine finds
Every place a routine gathers tasks from the whole account SHALL find a task only when the task is not in the Trash, it has no project or its project is one of the user's projects that is not in the Trash, and that project is not archived. These places are Find tasks by a condition, a filter query or a saved view, the matching tasks of a scheduled trigger with a condition (and the sweep of a one-card scheduled rule), the editor's live preview of them, and the When card's count of matching tasks. Only the task's own project SHALL count. A deleted task, or a task of a project in the Trash, SHALL never be found, and no input or setting SHALL change that. Find tasks SHALL take an optional yes/no input `archived` ("Archived projects" on its card); when it is yes, tasks of archived projects SHALL be found too, in all three forms. Completed tasks SHALL keep the existing rule: a condition finds open tasks, and a query or view follows the filter rule. Steps that act on a list they receive (Pick, Sort, Filter, Repeat, Count, Set focus) SHALL never add tasks to it. The Go engine and the editor SHALL apply the same rule, pinned by shared vectors. The rule reads the rows the run or the device holds: offline the preview applies it to the device's data, and a project archived or restored on another device changes what a run finds once that change has synced; nothing is written by the rule itself, so there is nothing to converge.

#### Scenario: Archived projects are left out by default
- **WHEN** a routine runs Find tasks where due is overdue, and the user has one overdue task in a live project and one in an archived project
- **THEN** the step finds only the task of the live project, and its card's preview lists the same task

#### Scenario: A saved view finds what its page lists
- **WHEN** a routine finds tasks with the saved view "p1", and a priority-1 task sits in an archived project
- **THEN** the step does not find that task, as the view's own page does not list it

#### Scenario: Include archived projects
- **WHEN** the user adds Archived projects to the Find tasks card and leaves it on yes, and the routine runs
- **THEN** the step finds the overdue tasks of the archived project too

#### Scenario: A project in the Trash
- **WHEN** the user moved a project with two open tasks to the Trash and a routine runs Find tasks with an empty condition, with Archived projects on
- **THEN** neither task is found

#### Scenario: Deleted tasks
- **WHEN** a task is in the Trash and a routine runs Find tasks with the query `all` or a condition that matches it
- **THEN** the task is not found, and there is no input that would find it

#### Scenario: A scheduled trigger's matching tasks
- **WHEN** a routine runs every Monday on the tasks that are overdue, and one overdue task belongs to an archived project
- **THEN** the trigger's matching tasks leave that task out, and the When card's count does not include it

#### Scenario: Shared vectors
- **WHEN** the scope vectors (a task in the Trash, a project in the Trash, an archived project with and without `archived`, an unknown project, no project) run in Go and in TypeScript
- **THEN** both keep the same tasks
