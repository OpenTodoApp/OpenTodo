# Design: choose an open task as a project's next action

## D1. The next action stays derived

The next action is the project's first actionable task in list order (`MethodRules.nextActionOf`). Choosing a task does not set a flag; it edits the task so that it becomes that first actionable task, with the ordinary task ops:

- `start` cleared when it is Someday or a later date (the Someday step's promote);
- only when the current next action comes before it in the project's list: `position` set just above that task (`positionBetween` the open task before it in its section and it) and `section_id` set to that task's, so nothing else in the project moves. In Place there is no next action, so clearing the start is always enough.

`chooseNextActionUndoable` writes them through `applyBatch` (`source: 'action'`, with each field's previous value as its base), so the toast "Next action for <project>" offers Undo and Undo restores the start, position and section. Offline it applies locally at once and syncs later; concurrent edits converge field by field (last writer wins), as for any edit. No new field, so no data model impact.

## D2. Which tasks are offered

`MethodRules.nextActionChoices(projectId)`: the project's open top-level tasks in list order, without the current next action and without tasks that are blocked or assigned to someone else. In Place that is mostly Someday tasks, since a project there has nothing actionable, waiting or deferred.

## D3. One field, the reusable-suggest list

Rather than two buttons ("Choose existing", "Create new"), the existing field keeps typing a new step and gains a listbox, reusing `useTickedSuggest` (reusable-suggest) with `kind: 'next'`: it matches names that contain the typed text (two characters or more, at most eight), ↓ in an empty field lists every choice, and on a touch screen (`touchOnly()`, no ↓ key) focusing the empty field lists them with none chosen. Each row shows what choosing it changes ("Someday", "Starts <date>", the section it moves into). Nothing is chosen until an arrow key moves into the list, so Enter keeps adding what was typed; Esc closes the list and keeps the text. While the field offers tasks it is an ARIA combobox at all times (`aria-haspopup="listbox"`, `aria-expanded` false or true, `aria-controls` and `aria-activedescendant` while open) whose listbox is named "Open tasks", with a polite live region counting the matches. In the walk the field is quick add, so a typed line keeps its tokens; choosing a task ignores them. Quick add records the caret of a field focused as it mounts only when it has choices, so the palette and the sheet with a prefilled line open no token list on their own.

## Interface budget

No new chrome row, property, sidebar destination, scroll region or shortcut: the list is an overlay under an existing field, and ↓, Enter and Esc are the field's own keys. No new strings: the listbox reuses "Open tasks", the toast "Next action for {name}", the rows "Someday", "Starts {date}" and "No section", and the live region the Combobox's result count.

## Size

No dependency; a few hundred bytes of code in chunks that already load with the Loop home and the review.
