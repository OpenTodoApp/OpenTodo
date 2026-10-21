## ADDED Requirements

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
