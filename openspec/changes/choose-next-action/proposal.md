# Choose an open task as a project's next action

## Why

GitHub issue #1950 (owner-approved): in Loop home → Place, a project without a next action has a "What is the next step?" field, and the weekly review's project walk has "Add a next action". Both only create a new task. People often already hold the task they want to do next, usually parked in Someday, and want to choose it.

## What Changes

- The next-action field in Place, and quick add opened from the project walk (`q`, "Add a next action"), list the project's open tasks whose name contains what is typed, the pattern of the reusable list's ticked items (reusable-suggest). ↓ in the empty field lists them all.
- Nothing is chosen until an arrow key moves into the list, so Enter alone still adds what was typed, as today. ↓ and Enter (or a click) choose a task instead: it leaves Someday or its later start, and when another open task comes first it moves to the top of the project, out of its section. It is then the project's next action: Place drops the project, the walk's card shows it, and Next lists it.
- One field, no second button: typing a new step and choosing an existing one share the same control.

No new mandatory environment variable, no new op field, route or dependency, and no change to the op log format.

## Out of scope

- Choosing a task that is blocked or assigned to someone else (no edit of the user's own makes it actionable).
- Choosing a subtask, or a task of another project.
- A stored "next action" flag: the next action stays the first actionable task in list order (method-views).

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### Modified Capabilities

- `open-loops`: a project's next action can be chosen among its open tasks, in Place and in the project walk.
