## Context

habits-home (#1271) shipped the Habits screen, the Today strip, the form and the habit section of a task's page. Issue 1295 lists what reads wrong. This change only reshapes the surfaces; the calculation, the records and the sync stay as they are.

## Decisions

### D1 Today: one quiet line

The strip is a single line at the top of Today's list, without a group heading: a "Habits" text link (to `/habits`) in the muted meta style, then each due or kept-today habit as a 16 px ring in its hue followed by its title in meta text. The ring is the check button (kept: filled with a small check, disabled); the title is a link to the habit page. No borders, no filled chip backgrounds, no count and no fold. What does not fit on the one line folds into "+N", a link to Habits. Narrow screens keep one line too, so Today's first task stays where it was. Alternatives: a ListGroupHeader with a count (the "Habits 0" the owner found unclear), chips (heavy).

### D2 One-line rows, a button on every row

A row is a grid that never wraps: colour dot, title (one line, `TruncatedText`, full title in the tooltip and accessible name), anchor in meta text after the title on wide screens, thread (hidden below 640 px, on its own line below the title there), measure, check button. Below 640 px the thread line is a second grid row, not flex wrapping, so the measure and button never fall under the title. Every row has a check button: a habit due later (a weekly habit on another day) checks in its current occurrence early, exactly as completing the task does, with the label "Check in {title} early ({date})". A repeating task without a due date made into a habit gets its first date from the rule (the cause of a row without a button and without numbers).

### D3 A page of its own

`/habits/<id>` renders the habit page inside the Habits screen's width: a back link to Habits, the title, one line of facts ("Every day · Evening · After dinner"), the tiny version, four numbers (Strength, Kept, Streak, Best), the Check in button, the month history with editable past days, and a menu: Edit, Graduate (or Resume), Open as a task, Stop tracking as a habit, Delete. Habit rows, the strip and `[[` links open it. The task page (`/task/<id>`) and the docked panel show it for an open habit series while Habits is on; `/task/<id>?as=task` (the menu's Open as a task) shows the full task page, for the fields a habit page leaves out (project, labels, reminders, notes). An occurrence record still opens as a task. Alternatives: a lean mode of the task panel (keeps every task affordance one click away and the series note), a dialog (no address, no history).

### D4 One lean form

New habit, Make it a habit and Edit open the same dialog: Title, How often, Tiny version, After, Part of the day, Colour. "Tiny version" and "After" carry a "?" button after the label with a Tooltip on hover and focus ("The two-minute version that still counts on a bad day", "The routine this habit follows, like 'After dinner'"). Edit writes one batch with one Undo through the same plan as Make it a habit. The task-series scope control ("Only future ones / Also past ones" and its note) is never shown for a habit: a habit's edits apply to the series; its records keep their own fields.

### D5 Colour

`habit_color` is an additive task field, a palette hex or "" (automatic). The hue is `habit_color` when set, else the project's colour, else one from the id as before. Not content (like project colours), so the server can show it on an encrypted account. The form offers Automatic and the 12 palette colours as a radio group.

## Risks / Trade-offs

- Showing the habit page for `/task/<id>` changes where a link to a habit lands; Open as a task keeps the full page one step away.
- Early check-in on a later day writes that day's record ahead of time. It is what completing the task already does and is labelled with the date.
