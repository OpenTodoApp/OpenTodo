# Design: choose an open task as a project's next action

## D1. The next action stays derived

The next action is the project's first actionable task in list order (`MethodRules.nextActionOf`). Choosing a task does not set a flag; it edits the task so that it becomes that first actionable task, with the ordinary task ops:

- `start` cleared when it is Someday or a later date (the Someday step's promote);
- when another open top-level task comes first in the project's list, `position` set above every task (`topTaskPositions`, as an add at the top) and `section_id` cleared when the task is in a section, so it is first in the project.

One `updateTask` call writes them as one batch: offline it applies locally at once and syncs later; concurrent edits converge field by field (last writer wins), as for any edit. No new field, so no data model impact.

## D2. Which tasks are offered

`MethodRules.nextActionChoices(projectId)`: the project's open top-level tasks in list order, without the current next action and without tasks that are blocked or assigned to someone else. In Place that is mostly Someday tasks, since a project there has nothing actionable, waiting or deferred.

## D3. One field, the reusable-suggest list

Rather than two buttons ("Choose existing", "Create new"), the existing field keeps typing a new step and gains a listbox, reusing `useTickedSuggest` (reusable-suggest) with `kind: 'next'`: it matches names that contain the typed text (two characters or more, at most eight), and ↓ in an empty field lists every choice. Nothing is chosen until an arrow key moves into the list, so Enter keeps adding what was typed; Esc closes the list and keeps the text. While the list shows, the field is an ARIA combobox (`aria-expanded`, `aria-controls`, `aria-activedescendant`) whose listbox is named "Open tasks". In the walk the field is quick add, so a typed line keeps its tokens; choosing a task ignores them.

## Interface budget

No new chrome row, property, sidebar destination, scroll region or shortcut: the list is an overlay under an existing field, and ↓, Enter and Esc are the field's own keys. No new strings: the listbox reuses "Open tasks" and the review's notice "Added a next action to {name}.".

## Size

No dependency; a few hundred bytes of code in chunks that already load with the Loop home and the review.
