# Design

## Context

- `routines-engine` (shipped) introduced the step model: typed values (Text, Lines, Task, Tasks, Project, Date, Number), references to the trigger (`trigger`), to earlier steps and, inside Repeat for each, to the current item (`item`). D3 there says a step that takes one item and gets a list runs once per item. Both checkers (`internal/ruleval/steps_check.go`, `web/src/lib/rules/steps.ts`) and the run (`internal/rules/routine.go` `run`) implement it, and the vector "for each: note text of tasks gives lines" pins it.
- `routines-editor` (shipped) gave it the sentence-card editor: `newStep` wiring in `web/src/lib/rules/draft.ts`, pickers and `InsertAbove` in `web/src/app/routines/words.tsx`, fixes in `web/src/lib/rules/fixes.ts`, Add step suggestions in `web/src/app/routines/AddStep.tsx`, and the save check in `RoutineEditor.tsx`.
- The owner's feedback and the decision "Routines are dynamic, not static" (DECISIONS.md, 2026-11-01) are in the proposal. The owner then asked for this to stay tight: fix the interface wherever the model already works, and change the model only where it clearly must. They also asked that every reasonable use case can be built (D12).

## Audit

Every finding is marked **(a)**, meaning the engine already supports it and the editor hides it or leads away from it, or **(b)**, a real gap in the model.

### Step inputs and their literal kinds

| Step | Input | Accepts | Literal today | Finding |
|---|---|---|---|---|
| Add a comment | `task` | Task (a list runs once per task) | a task | **(a)** a list already works; the literal is the default way to fill the input in the editor |
| Get a task | `task` | Task | a task | **(a)** exists only to hold a hand-picked task; the editor inserts it as a "fix" |
| Start a timer | `task` | Task (per task) | a task | **(a)** as Add a comment |
| Notify me | `task` (optional link) | Task (per task) | a task | **(a)** as Add a comment |
| Get note text, Add to a note, Clear a note | `of` | Task or Project (per task) | none | **(a)** a list works; **(b)** a project note needs *Find a project* by name: a content lookup that breaks when the project is renamed and makes the routine a content routine on an encrypted account |
| Change tasks, Set today's focus, Send a webhook | `tasks` | Tasks (a Task coerces) | none | fine |
| Create tasks | `project`, `section`, `labels`, `due`, `priority` | Project, Date, Number | project, section id, label ids, date, number | fine: fixed destinations. **(b)** no parent task, so no subtasks |
| Find tasks | `query`, `view`, `condition` | none | text, view id, condition | **(b)** a query is evaluated over open tasks only, so `completed = this week` finds nothing, against the filter's own rule (`filter-queries` "Open, completed and deleted tasks") |
| Filter | `where` | none | condition or contains | fine: the same condition rows as Find tasks |
| Take | `n`, `from` | none | number, start or end | **(a)** covers first, last, first N and last N, named "Take first"; **(b)** no "all" |
| Sort, Count, If, Repeat | lists, values | as declared | enums, compare | fine |
| Update a project, Create sections, Favourite, Tracked time | `project` | Project | a project | fine: a container |
| Project from a template | `template`, `start` | Date | template id, date | fine: a fixed source |
| Send a webhook | `webhook_id` | none | webhook id | fine: a configured target |
| Ask AI, Summarise (`routines-ai-step`) | `context`…, `text` | Text, Lines, Tasks, Project (a Task as a list of one) | none | fine: references only, no task literal |
| Email me, Email project members | none | none | none | fine: the user's own address or the shared project's members |
| (none) | | | | **(b)** no way to get today's date as a value (for "Waiting since <date>"), and no way to get a task's project |

### The editor's defaults and fixes

1. **(a)** `newStep` fills an input from the step above only when the types are exactly equal (`d.accepts.includes(above.type)`). Tasks above a one-task input (Add a comment after Find tasks or Take) leaves it empty.
2. **(a)** Inside an empty Repeat block, `addIn` passes `above: 'start'`, so a step added inside the loop never reads `item`, although the picker lists it. This is the owner's second screen.
3. **(a)** The trigger is never used by the wiring, so the first step of an event routine (*Comment on the task that triggered*) starts empty.
4. **(a)** An empty input's fix is "Choose a value". It opens a picker whose first control, for a task input with a literal, is a Combobox of single tasks. For a reference-only input, `InsertAbove` offers "Choose a task", which inserts *Get the task [x]*. This is the owner's first screen.
5. **(a)** A task input's placeholder reads "choose a task", even when a list is flowing.
6. **(a)** Add step suggests, after Tasks: Change tasks, Count, Filter, Sort, Take, Repeat. It doesn't suggest Add a comment. After a Task it suggests Get a task.
7. **(a)** The manual trigger's task ("the task you run it on", used when a routine is run from the palette with a task open, from `ot routine run --task` or MCP `task_id`) is hidden from pickers, so a "run on this task" routine can't read it.
8. **(a)** `saveError` is set by Save and cleared only by the next Save. "A routine needs at least one step", from a Save before the first card, stays on screen after cards are added.

### Triggers

| Trigger | Output | Finding |
|---|---|---|
| Event (`task.created`, `task.completed`, `label.added`, …), `due.reached`, `overdue` | Task: the task that triggered | fine and dynamic; acts as a list of one. Editor: finding 3 |
| `schedule` with a condition | Tasks: the matching tasks | fine |
| `schedule` without a condition | Date: the day | fine. **(b)** weekdays only, so no monthly routine |
| `manual` | Task: the task it is run on, when it is run on one | fine; editor: finding 7 |

### Starters (`routines-starters` D3)

- *Groceries from a note* puts `{ask: list}` (a project) into `of`, which takes no literal, so it doesn't type-check. **(b)** It needs the project literal on `of`.
- *Waiting follow-up* writes "Waiting since {date}", but nothing outputs a date on an event trigger. **(b)** It needs Get the date.
- *Friday digest by email* finds "completed this week" with Find tasks, which finds nothing today. **(b)** It needs Find over completed tasks.
- *Monthly review project* fakes a monthly schedule with weekdays and an If on the day number, which no comparison can express. **(b)** It needs `month_days`.
- *Meeting notes to tasks* creates tasks "in the task's project", but no step outputs that project. **(b)** It needs Get the project of a task.
- *Sunday overdue sweep*, *Morning focus* and *Inbox over 20* are fine.

### CLI, MCP, docs, tests

- `ot routine show` prints kinds and inputs (`take (from = "end", list ← a, n = 3)`). It's honest, but it doesn't say Pick.
- MCP `create_routine` and `update_routine` describe steps by reference to `docs/routines.md`. Neither these descriptions nor the docs say that a task input takes a list. The docs' Groceries example and the live spec scenario "Reading a routine" begin with *Get the task Groceries*: a hand-picked task as the canonical example.
- The vectors pin the per-task run for Get note text only. No vector or engine test covers Add a comment, Start a timer or Notify me over a list, Take's output into a one-task step, or a Repeat whose inner step reads `item` for a comment.

## Decisions

**D1. One task is a list of one; task steps act on each.** **(a)** Every step input that acts on tasks accepts a Task, a Tasks list, the trigger's task or the loop's item. Given a list, the step runs once for each task, in the list's order, and its output is the list of the per-task outputs (none for Add a comment). The semantics are the ones `routines-engine` D3 already implements. This change makes them the declared contract:

- **Signatures (unchanged names, declared as lists).**
  - Add a comment: `task: Task…`, `text: Text`.
  - Start a timer: `task: Task…`. Starting several timers in turn ends with the last one running, by the one-running-entry rule; the docs say so.
  - Notify me: `text: Text`, `task?: Task…`.
  - Get note text: `of: Task… | Project` → Text (Lines when given a list).
  - Add to a note: `of: Task… | Project`, `text: Text`.
  - Clear a note: `of: Task… | Project`.
  - Get the project of a task: `task: Task` → Project (D5).
  - Change tasks, Set today's focus, Send a webhook: `tasks: Tasks` (a Task coerces).

  `Task…` means "a task or a list of tasks, run once per task". Both checkers already accept it, so no stored routine changes. The catalogue route and the step table keep `accepts: ["task"]` (the for-each rule is the checker's). The editor's `fits`, `newStep`, the docs and the MCP description read the rule from one helper, `takesEach(input)`.
- At most one input of a step may receive a list for each of its items (unchanged). Two lists into one step, such as Add a comment with tasks and lines, keep the existing `for_each` error, whose fix is Repeat for each.
- **Compatibility.** A routine saved with `task: {literal: {task: id}}` or a reference to Get a task keeps running unchanged, as a list of one. Nothing is migrated, and no operation is written to any rule.

**D2. Pick.** One card for choosing which items of a list go on. *Take* is renamed in the interface; the stored kind stays `take`.

- **Engine (b, small):** `take.from` gains `"all"`, and `take.n` becomes optional with default 1 (ignored with `all`). A routine stored before this change always has `n`, so its meaning is unchanged. Output: the same list type, so *Pick the first* yields a Tasks list of one, which flows into any task step (D1).
- **Interface (a):** the card reads *Pick [the first ▾] of [the tasks]*. Its mode menu, in this order:
  - **The first** (`n: 1, from: start`)
  - **The last** (`n: 1, from: end`)
  - **The first N…** (`n`, `from: start`), with a number word
  - **The last N…** (`from: end`)
  - **All** (`from: all`)
  - **The ones where…**: this switches the card in place to a `filter` step with the same id, so later references stay valid, and its `where` word opens the same condition rows as Find tasks. A Filter card's mode menu switches back to the other modes. For Lines, "The ones where…" offers "contain" and "don't contain" (the existing `where` shape).
- Output names: "the picked task" (`n` 1), "the picked tasks", "the picked lines", "the matching tasks".
- **Order.** Pick reads the list in the order it comes in. Find tasks keeps list order (project order, then position). When the list a Pick card reads doesn't pass through a Sort step, the card shows "In list order · Sort first". The link inserts a Sort step (by due, ascending) between the list and the Pick and points Pick at it. Sort stays its own card, so "the most overdue task" is Find → Sort by due → Pick the first.
- Add step lists Pick under "Lists and logic", with the synonyms first, last, all, top, limit, where, keep, filter, choose and take. *Filter* is no longer listed separately: it is "Pick … the ones where", and searching "filter" finds Pick. A saved Filter step shows as a Pick card in the "where" mode.

**D3. The editor wires flowing data.** **(a)**

- **Nearest flowing value.** For an input, the editor takes the first candidate that fits (`fits` is `yes` or `each`):
  1. the loop's item, when the step is inside Repeat for each;
  2. the output of the step directly above, then earlier visible outputs, nearest first;
  3. the trigger's output.
- **On insert:** `newStep` fills the step's main input (its first required input, or the first input of its source set) with the nearest flowing value. This holds for Add step anywhere, the first step in a Repeat or If block included.
- **Pickers** list, in order: the loop's item ("↳ each task", "↳ each line"), earlier outputs nearest first, then the trigger ("the task that triggered", "the matching tasks", "the day", or for a manual routine "the task you run it on"). Values of another type stay under "Needs conversion" with their conversion. Below the chips:
  - for a Tasks or Task input, **Find tasks…** (inserts a Find tasks step above and reads it);
  - for a Project input, the project Combobox (a container, D4);
  - for a Task input only, a folded **A specific task…** row last (D4).
- **Placeholders** name what is wanted, not a single pick: "choose which tasks" for a Task or Tasks input, and "choose a project", "write a text" and so on as today. With a flowing value available, an empty input never stays empty after an insert, so the editor never shows "choose which tasks" next to an available list.
- **Missing input fix:** "Use *<nearest flowing value>*" (one edit) when one exists; otherwise "Find tasks…" for task inputs and "Choose a value" for the rest. The fix table never inserts Get a task or a literal.
- **Removed step:** when a card's reference becomes unknown, the fix is "Use *<nearest flowing value>*" when one exists, otherwise "Choose another value".
- **Type mismatch, Tasks into a one-task input:** this is no longer an error (D1). The fix "Wrap in Repeat for each" remains only for the `for_each` error (two lists into one step).

**D4. Static references.** Allowed as first-class literals, offered in pickers and filled by starters' placeholders, only where a fixed target is natural:

- a destination or container: a project (Create tasks, Update a project, Create sections, Favourite, Tracked time, and now a note's project, D5), a section, labels, a saved view (Find tasks), a template;
- a configured target: a webhook, the user's own email address, a shared project's members.

**A specific task** stays as a literal on Add a comment, Start a timer and Notify me, and as Get a specific task. The reasons:

- **Compatibility.** Routines are saved with it, by the editor of `routines-editor`, the CLI and MCP.
- **The rare standing target.** A task can be used as a log or a list ("add each new idea to the note of my *Ideas* task", "comment on my *Weekly log* task").

It is always secondary. It is reachable only from the folded "A specific task…" row at the end of a picker, or from *Get a specific task*, which is found by search but never suggested, never placed in a group's first six, and never used by a fix, a default or a starter. A card holding a specific task says "Always this task". No new task literal is added: Get note text, Add to a note and Clear a note get a project literal, not a task literal. The CLI and MCP keep accepting `{task: id}`; their descriptions say a routine normally reads tasks from the trigger or an earlier step.

**D5. Small model additions (b).** Each one is an additive kind or input in both step tables, with vectors:

- **`of` takes a project literal.** Get note text, Add to a note and Clear a note: `of` accepts `{project: id}` as a literal, alongside the Task and Project references. The API resolves the id like any project literal (the project exists and isn't deleted). With a literal project, the step is a content step only by its own kind (note text, writing a note), not because of a name lookup.
- **`date`, "Get the date":** input `date` (a date literal: `today`, `tomorrow`, `{in_days: n}`, `YYYY-MM-DD`; default `today`), output Date, in the user's time zone and day start. It is not a content step.
- **`project_of`, "Get the project of a task":** input `task: Task` (required, reference only), output Project. A task without a project gives the Inbox value (an empty project id). Create tasks given the Inbox value creates in the Inbox; a step that needs a real project (Update a project, Create sections, Favourite, a note) fails that run with `not_found` "the task has no project". A list into `project_of` is the existing `for_each` error ("cannot run once per item here; use Repeat for each"), because there is no list of projects.
- **`create_tasks.parent`:** optional, accepts Task (reference only), so a task given a list runs once per parent. It creates the new tasks as subtasks of the parent, through the registry tool's `parent_id`. The project then comes from the parent, and a `project` input next to `parent` is a type error ("use the parent's project or no parent").
- **`split_lines.only: "open_checkboxes"`:** Split into lines removes list markers and checkboxes, so a later Pick cannot tell an open checkbox from a done one or a plain line. With `only: "open_checkboxes"` it keeps only the lines that are open checkboxes (`- [ ] book room`, `[ ] send agenda`, `2. [ ] call Ada`) and strips them like any line. The shared data vectors pin it.
- **Find tasks over completed tasks:** a `query` or `view` source follows the filter rule. It matches open tasks only, unless the query names `completed` or `open` or compares the completion date (`internal/filter` `MentionsState`). Then it reads every live task, completed ones included. The 500-item limit and list order stay. A `condition` source stays open tasks only, as rule conditions are.
- **Condition predicate `unchanged`** (`automation-rules` "Conditions"): `{days: 1..365}` matches a task none of whose own fields has changed in the last N days. Its newest winning field time falls on a day at least N days before today, in the user's time zone and day start. Comments, time entries and attachments are separate entities and don't count. The server reads the newest `fields.ts` of the task; the device reads its `clocks` rows. Both are plaintext metadata on every account, so the predicate evaluates the same on encrypted accounts. Shared vectors (`match.vectors.json`) carry a last-changed time per task. The condition rows offer it as "Not changed for [30] days".
- **Schedule `month_days`** (`automation-rules` "Rule validation", "Time triggers"): `schedule` takes either `weekdays` or `month_days`, exactly one. `month_days` is a non-empty list of distinct days from 1 to 31 and/or `"last"`. A day past the end of a month doesn't fire in that month (31 doesn't fire in April); `"last"` fires on the month's last day, and the same day never fires twice. It uses the same per-rule watermark and time zone as weekdays. The When card offers "Every month on [1]" and "on the last day".

**D6. Repeat for each stays, for advanced cases.** **(a)** Repeat is right when several steps must run per item with that item's own values (comment on each task with its own note text, then change it). Steps added inside it read "↳ each task" by default (D3), and the picker lists the item first. The common case needs no loop: *Find → Pick → Add a comment* or *Find → Add a comment*. Neither Add step, the fixes nor any starter offers Repeat as the way to get a list into a task step.

**D7. The false "needs at least one step".** **(a)** A save error is state of the last Save attempt. Any edit of the draft clears it. The editor computes "A routine needs at least one step" only when the draft has no step when Save is pressed, and Test stays disabled without a step, as today. The top banner shows only an error of the current draft.

**D8. Names in sentences.**

- **Tasks:**
  - Add a comment: *Comment on [the picked task]: [text]*.
  - Pick: *Pick [the first ▾] of [the tasks]*.
  - Get the date: *Get the date [today]* → "the date".
  - Get the project of a task: *Get the project of [the task]* → "the task's project".
  - Create tasks with a parent: *Create subtasks of [the task] from [the lines]*.
  - Get a specific task: *Get the specific task [Groceries]*, marked "Always this task".
- **Previews over a list:** "Would add 4 comments", "Would add to 3 notes"; Get note text over a list previews one line per task's note.

**D9. CLI, MCP, docs.**

- `ot routine show` prints `take` as `pick first|last|first N|last N|all of <ref>`, `filter` as `pick … where …`, and the new kinds by their names. `--json` is unchanged (the stored steps).
- MCP: `create_routine` and `update_routine` describe steps with a short contract: "Steps read tasks from the trigger or earlier steps; a step that takes a task and gets a list runs once per task. Pick = take with from first|end|all. A specific task literal {task: id} is for rare fixed targets only". `run_routine.task_id` reads "the task a manual routine is run on".
- `docs/routines.md`: rewrite "Steps and values" around data flowing, add a "Pick" section, and replace the Groceries example (a project note, not a task). `docs/api.md`: the new kinds, inputs, `from: all`, `unchanged`, `month_days`. `docs/automations.md`: "Not changed for" and days of the month.

**D10. What stays out, and why.**

- **Relative field changes** ("raise priority by one", "push due by a week"): a re-run, an overlapping schedule or a retry after Undo would compound them, and the plan-then-write run and its Undo are built on absolute values (`automation-rules` "Idempotent runs"). "Raise the priority of overdue waiting tasks" is built by setting it (P1 or P2).
- **Lists of projects**: proposal, "Out of scope".
- **A selection as the manual trigger**: proposal, "Out of scope".

**D11. Starters corrected** (`routines-starters` D3, updated by this change):

| Slug | Trigger | Steps |
|---|---|---|
| `groceries-from-note` | Friday 17:00 | Get the note text of *list* (a project) → Split into lines → Create tasks from the lines in *into* |
| `sunday-overdue-sweep` | Sunday 18:00, condition overdue | Change the matching tasks: due tomorrow → Count → Notify me "{count} tasks moved to Monday" |
| `waiting-follow-up` | a task gets the label *waiting* | Get the date today → Comment on the task that triggered "Waiting since {date}" → Change it: due in 3 days |
| `friday-digest-email` | Friday 16:00 | Find tasks `completed = this week` → Count → Format text → Email me |
| `morning-focus` | weekdays 07:30 | Find tasks due today → Sort by priority → Pick the first 3 → Set today's focus |
| `inbox-over-20` | weekdays 09:00 | Find tasks `no project` → Count → If more than *n*: Notify me |
| `monthly-review-project` | every month on day 1 | Create a project from the template "Weekly review" starting the day |
| `meeting-notes-to-tasks` | manual, run on a task | Get the note text of the task you run it on → Split into lines, only open checkboxes → Get the project of the task → Create tasks from the lines in the task's project |

No starter uses a specific task. The starter check (`routines-starters` D2) refuses a starter with a `{task}` literal or a `get_task` step.

**D12. Use cases: the acceptance suite.** The matrix below is the bar for this change. Each row marked buildable is a case in `web/src/lib/rules/usecases.json` (beside the step vectors, read by both sides): the routine (trigger, condition, steps), seeded tasks, projects and labels, the clock, and the expected writes (created tasks with title, project and parent; changed fields; comments; notes; timers; focus; notifications, webhooks and emails queued). `internal/rules` runs every case through the real run against a seeded store and compares the writes exactly. The TypeScript checker type-checks every case (`usecases.test.ts`), so the device and the server agree that each routine is valid. The file carries the seeds and the expected writes, not only the steps, so the TypeScript planner for device runs (`routines-ai-step` task 3.1) can run the same suite and must produce the same writes. Rows marked **editor** also have a happy-dom test (`web/src/app/routines/usecases.test.tsx`). It builds the routine through the editor (Add step, pickers, the Pick mode menu) from an empty draft and asserts that the saved steps equal the case's steps, that no step is `get_task`, that no input holds a `{task}` literal, and that "choose which tasks" never appears.

Status: **today** = buildable before this change, in the engine and the editor. **after (a)** = the engine runs it today, but the editor led away from it. **after (b)** = needs a model addition of D5 or D2. **not** = out of scope, with the reason.

| # | Routine, in plain words | Status | Steps after this change | Editor |
|---|---|---|---|---|
| 1 | (owner) When I run it, find my overdue tasks, pick the first, and comment "Still on it?" | after (a) | Find tasks (due overdue) → Pick the first → Comment on the picked task | editor |
| 2 | (owner) Same, but the last one | after (a) | … → Pick the last → Comment | editor |
| 3 | (owner) Same, on all of them | after (a); Pick "All" after (b) | Find → Comment on the tasks (or Find → Pick all → Comment) | editor |
| 4 | (owner) Same, on the three most overdue | after (a) | Find → Sort by due → Pick the first 3 → Comment | editor |
| 5 | (owner, second screen) Find my overdue tasks, and for each: comment "Still on it?" | after (a) | Find → Repeat for each → Comment on each task | editor |
| 6 | (engine) Every Friday at 17:00, turn the lines of my Groceries project note into tasks in Errands | after (b): project literal on `of` (today only via Find a project by name) | Get the note text of Groceries → Split into lines → Create tasks in Errands | editor |
| 7 | (engine) When a task gets the label waiting, count my waiting tasks and notify me when there are more than 10 | today | Find (label waiting) → Count → If more than 10: Notify me "{count} waiting" | |
| 8 | (engine) Every morning, move what is overdue to today and send the list to my Home Assistant webhook | today | schedule 07:00 + condition overdue → Change the matching tasks: due today → Send the webhook with the changed tasks | |
| 9 | (starter) Sunday overdue sweep | today | as D11 | |
| 10 | (starter) Waiting follow-up: comment "Waiting since <today>" and due in 3 days | after (b): Get the date; the comment on the trigger is after (a) | as D11 | editor |
| 11 | (starter) Friday digest of what I completed this week, by email | after (b): Find over completed | as D11 | |
| 12 | (starter) Morning focus: the 3 highest-priority tasks due today | today (Pick naming after (a)) | as D11 | |
| 13 | (starter) Notify me when the Inbox has more than 20 tasks | today | as D11 | |
| 14 | (starter) On the 1st of each month, create my review project from the template | after (b): `month_days` | as D11 | |
| 15 | (starter) Run on a meeting task: its note's open checkboxes become tasks in the task's project | after (b): Get the project of a task; the manual trigger's task after (a) | as D11 | editor |
| 16 | Every Monday, comment "Still relevant?" on tasks nobody changed for 30 days | after (b): `unchanged` | schedule Monday 09:00 + condition unchanged 30 days → Comment on the matching tasks | editor |
| 17 | When I complete a task in Clients, create "Follow up: <title>" in Admin, due in 3 days | today | trigger completed, condition project Clients → Create the task "Follow up: {trigger}" in Admin due in 3 days | |
| 18 | Move the last 3 tasks of my "Someday" view to tomorrow | today (Pick naming after (a)) | Find (view Someday) → Pick the last 3 → Change: due tomorrow | |
| 19 | Email me a summary of today's tasks | today | Find (due today) → Format text "{tasks}" → Email me "Today" | |
| 20 | For each overdue task labelled waiting, comment "Any news?" and make it priority 1 | after (a) | Find (overdue, label waiting) → Comment on the tasks → Change the tasks: priority 1 | editor |
| 21 | Every evening at 21:00, move today's open tasks to tomorrow and tell me how many | today | schedule + condition due today → Change: due tomorrow → Count → Notify me | |
| 22 | When I run it, start the timer on my most important task due today | after (a) | Find (due today) → Sort by priority → Pick the first → Start the timer on the picked task | editor |
| 23 | When I complete a task, add "Done: <title>" to the note of my Journal project | after (b): project literal on `of`; the trigger's task is after (a) | trigger completed → Add "Done: {trigger}" to the note of Journal | |
| 24 | When I add a task labelled idea, add its title to the note of my "Ideas" task and move it to the Trash | today, with a specific task (D4, the rare standing target) | trigger label.added idea → Get the specific task Ideas → Add "{trigger}" to its note → Change the task that triggered: Trash | |
| 25 | Run on a task: turn the lines of its note into subtasks | after (b): `create_tasks.parent` | Get the note text of the task you run it on → Split into lines → Create subtasks of the task from the lines | editor |
| 26 | Every Sunday, send the tasks I completed last week to my webhook | after (b): Find over completed | Find `completed = last week` → Send the webhook with the tasks | |
| 27 | Every Friday, if I tracked less than 10 hours this week, notify me | today | Tracked time this week → If less than 600: Notify me | |
| 28 | When a task is assigned to me, comment "On it" and set it due today | after (a): the trigger's task | trigger assigned.to_me → Comment on the task that triggered → Change it: due today | editor |
| 29 | For each task due today in Work, comment with the first line of its note | today (Repeat for advanced cases); the item default after (a) | Find (due today, Work) → Repeat for each: Get the note text of each task → Split into lines → Pick the first → Comment on each task with it | |
| 30 | On the last day of the month, notify me how many tasks I completed this month | after (b): `month_days` last, Find over completed | schedule last day → Find `completed = this month` → Count → Notify me | |
| 31 | Raise the priority of every overdue task by one level | not: relative change (D10); row 20's "make it priority 1" is the buildable form | | |
| 32 | Every week, archive the projects that have no open tasks | not: no lists of projects (proposal, "Out of scope") | | |
| 33 | When an RSS feed has a new item, create a task | not: no URL fetch (AGENTS.md rule 5; `routines-engine` "Out of scope") | | |

## Data model impact

- **Op schema:** none. `rule.steps`, `rule.trigger` and `rule.condition` are whole values whose shape checks gain additive members (`take.from: "all"`, an optional `take.n`, a project literal on `of`, kinds `date` and `project_of`, `create_tasks.parent`, the predicate `unchanged`, `schedule.month_days`). No op field is added, renamed or removed. `internal/sync/ops.go` `Schema` is unchanged, and `web/src/generated/opSchema.ts` stays as it is (the generator test confirms it).
- **Convergence and offline:** unchanged. Editing a routine stays an operation on whole values, applied locally first and converging by last-writer-wins. A device that predates this change and receives a routine with a new kind, member or value lists it as "Made with a newer version" (`automation-rules` "Rule entity").
- **Server state:** none new. `unchanged` reads the existing `fields` table (primary key `user_id, entity, entity_id, field`). The scheduler's watermark is reused for `month_days`.

## Size and memory

No new dependency. Web: the new kinds, Pick and the wiring add about 1.5 KB gzip to the routines chunk, which is already lazy. First load is unchanged, and `web/bundle-budget.json` is untouched. Server: a few KB of code. `unchanged` costs one indexed read per task matched, only for conditions that use it; `month_days` costs nothing extra per pass.

## Interface budget

- **Chrome rows:** unchanged. Pick is a card like any other, its mode menu is a Menu, and "In list order · Sort first" is a line inside the card.
- **Task properties:** none added.
- **Sidebar:** unchanged.
- **Scroll regions:** unchanged (the editor's one column; pickers are popovers).
- **Shortcuts:** none new.

## Rollout and PRs

1. **Engine and vectors:**
   - `take` all and optional n;
   - project literal on `of`;
   - `date`, `project_of`, `create_tasks.parent`;
   - Find over completed tasks;
   - Go and TypeScript step tables and vectors;
   - the use-case suite's engine part for every row that needs only these.
2. **Editor:**
   - wiring (D3), Pick (D2), pickers and fixes, the specific task folded (D4);
   - Add step suggestions, the save error (D7), sentences (D8);
   - six catalogs, stories and baselines;
   - the editor use-case tests.
3. **`unchanged` and `month_days`:** the condition predicate (Go, TypeScript, vectors, condition rows), the schedule member (validation, scheduler, When card) and the remaining use-case rows.
4. **CLI, MCP, docs, starters table** (some docs land with each PR), then the archive.

Each PR is green on `make check` and merged before the next starts. The editor PR starts only once `routines-ai-step` part 2 (#720) is merged or closed, because both touch `web/src/app/routines/`.

## Open questions

None for the owner. The defaults chosen here are reversible:

- "All" in Pick;
- Filter folded into Pick;
- a specific task folded, not removed;
- `month_days` without "every N months".
