---
title: Filter queries
summary: The filter language in full: terms, operators, dates, saved views, dashboards and ten worked examples.
audience: user
section: Reference
specs: [filter-queries, custom-views]
screens: []
order: 20
---
# Filter queries

The **Filter** view (sidebar, or `g` then `f`) lists the tasks that match a one-line query such as:

```text
@work & due <= tomorrow & p1
```

Queries run entirely on your device, over the data the app already holds: they work offline, make no network request, and the results update live as you edit tasks or as changes from your other devices arrive.

## Grammar

```text
query    := or
or       := and ( "|" and )*
and      := not ( "&" not )*
not      := "!" not | "(" or ")" | term
term     := "@" name                       label
          | "##" name | "#" name           project with / without sub-projects
          | "p1" | "p2" | "p3" | "p4"      priority
          | ("due" | "created" | "deadline" | "start" | "completed") cmp date
          | keyword
          | "search:" text
          | field ("<" | "<=" | "=" | ">=" | ">") value   custom field
          | "no" field                                  custom field without a value
field    := a word that is not a reserved word | '"' chars '"'
value    := number | "true" | "false" | date | word | '"' chars '"'
cmp      := "<" | "<=" | "=" | ">=" | ">" | "before" | "after"
date     := "today" | "tomorrow" | "yesterday" | weekday | YYYY-MM-DD
          | INT "days" | INT "days ago" | period
period   := ("this" | "last" | "next") ("week" | "month")
          | INT ("week" | "weeks" | "month" | "months") "ago"
weekday  := "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
keyword  := "overdue" | "today" | "tomorrow" | "no date" | "no project"
          | "no labels" | "no time" | "no deadline" | "no start" | "completed" | "open" | "subtask"
          | "someday" | "deferred" | "evening" | "blocked" | "unblocked" | "habit"
name     := word | '"' chars '"'
text     := word | '"' chars '"'
```

### Precedence and connectives

- `!` (not) binds tightest, then `&` (and), then `|` (or). `@errand | @call & p1` means `@errand | (@call & p1)`.
- Use parentheses to group: `(@errand | @call) & p1`.
- `&` and `|` are the only connectives. There is no implicit "and": `@work p1` is an error, write `@work & p1`.
- Whitespace between tokens is ignored, so `due<=tomorrow` and `due <= tomorrow` are the same.

### Names, quoting and case

- A bare name (`@errand`, `#Work`) runs until whitespace, a double quote, or one of the operator characters `& | ! ( ) < > =`. Any other character, including `#`, `-`, `/`, `.` and non-Latin letters, is part of the name.
- Put names with spaces or operator characters in double quotes: `#"Client A"`, `@"follow up"`. Inside quotes, `\"` is a literal quote and `\\` a literal backslash.
- Keywords, comparison words, weekday names, label names and project names all ignore case: `#work`, `#Work` and `#WORK` are the same.

## Terms

| Term | Matches |
| --- | --- |
| `@name` | tasks carrying the label with that name |
| `#name` | tasks in the project with that name |
| `##name` | tasks in that project or in any of its sub-projects, at any depth |
| `p1` … `p4` | tasks with that priority (`p1` is the highest, `p4` the default) |
| `due <cmp> <date>` | tasks whose due date compares as asked; a task without a due date never matches |
| `created <cmp> <date>` | tasks whose creation day, in your time zone, compares as asked |
| `deadline <cmp> <date>` | tasks whose [deadline](tasks-and-projects.md#deadlines) compares as asked; a task without a deadline never matches. `deadline <= 3 days` includes deadlines that have passed |
| `start <cmp> <date>` | tasks whose [start date](tasks-and-projects.md#when-a-task-starts) compares as asked; parked tasks and tasks without a start never match |
| `completed <cmp> <date>` | completed tasks whose completion day, in your time zone, compares as asked; open tasks never match. `completed = last week` is what you finished last week |
| `overdue` | due before today |
| `today` | due today |
| `tomorrow` | due tomorrow |
| `no date` | no due date |
| `no time` | a due date without a time of day |
| `no deadline` | tasks without a deadline |
| `no start` | tasks with no start date and not parked |
| `someday` | parked tasks |
| `deferred` | tasks whose start date is after today |
| `evening` | tasks marked for This Evening |
| `blocked` | tasks waiting for another task that is still open ([Blocked by](tasks-and-projects.md#wait-for-another-task)) |
| `unblocked` | tasks not waiting for any open task |
| `habit` | recurring tasks tracked as a [habit](recurring-and-reminders.md#track-a-habit); save `habit` as a view to list every habit with its streak |
| `no project` | Inbox tasks (no project) |
| `no labels` | tasks with no label |
| `subtask` | tasks that have a parent task |
| `completed` | completed tasks; the record a skipped habit day leaves is not one |
| `open` | open (not completed) tasks |
| `search: text` | title or notes contain the text, ignoring case; quote several words: `search: "oat milk"` |
| `name <cmp> value` | tasks whose [custom field](custom-fields.md) of that name compares as asked (see [Custom fields](#custom-fields)) |
| `no name` | tasks of a project that defines the field, with no value for it |

### Custom fields

A [custom field](custom-fields.md) is named like a project or label, ignoring case, in every project you see that defines a field of that name; quote names with spaces: `"Order date" <= friday`. The words the grammar already uses (`due`, `created`, `deadline`, `start`, `completed`, `no`, the keywords and `p1` to `p4`) keep their meaning, so a field named "due" is reached only through its quoted name, `"due" <= tomorrow`. How a field compares depends on its type:

| Type | Terms |
| --- | --- |
| Number | `cost > 100`, `cost <= 99.5`, `cost = 0` |
| Date | `"Order date" <= friday`, `"Order date" = this week`: the date grammar above |
| Text, link, choice | `client = "Acme"` only, ignoring case; `client > "A"` is an error |
| Checkbox | `paid = true`, `paid = false` (an unset box is unchecked) |

`no client` lists the tasks of projects that define Client and have no value for it. A value is only compared while its task is in a project that defines the field. A name that no project defines is not an error: the view warns `No field named "budget"` and the term matches nothing.

### Open, completed and deleted tasks

A query matches **open tasks only**, unless `completed` or `open` appears somewhere in it, or it compares the completion date (`completed >= this week`). `completed` on its own lists only completed tasks, `p1 & completed` the completed priority-1 tasks, and `completed | open` both. Deleted tasks never match, and neither does the record a skipped day of a habit leaves (it is neither completed nor open). Parked and deferred tasks match like any other unless you exclude them: `!someday`, `!deferred`. Like the other cross-project views, the Filter view leaves out tasks of archived projects.

### Dates

Dates compare **calendar days** in your local time zone, the same way Today and Upcoming do; the time of day is ignored.

| Expression | Meaning (when today is Saturday 2026-10-10) |
| --- | --- |
| `today`, `tomorrow`, `yesterday` | 2026-10-10, 2026-10-11, 2026-10-09 |
| `monday` … `sunday` | the next such day, today included: `friday` is 2026-10-16, `saturday` is 2026-10-10 |
| `2026-12-01` | that date |
| `3 days` | three days from today: 2026-10-13 |
| `7 days ago` | seven days before today: 2026-10-03 |

### Periods

A period stands for several days. Weeks start on the first day of the week you chose in **Settings → General → Date and time** (the browser's choice until you pick one), the same on all your devices; months are calendar months.

| Expression | Days (when today is Friday 2026-10-16 and weeks start on Monday) |
| --- | --- |
| `this week`, `last week`, `next week` | 2026-10-12 to 10-18, 2026-10-05 to 10-11, 2026-10-19 to 10-25 |
| `2 weeks ago` | 2026-09-28 to 10-04 (`1 week ago` is last week) |
| `this month`, `last month`, `next month` | October, September, November 2026 |
| `3 months ago` | July 2026 |

Against a period, `=` means *within it*, `<` (`before`) *before its first day*, `<=` *up to its last day*, `>` (`after`) *after its last day* and `>=` *from its first day*. A single day works the same way, so `due = this week` lists everything due this week, `completed >= last month` everything completed since the first of last month, and `due < this month` everything due before the first of this month. Every date term takes periods: `due`, `created`, `deadline`, `start` and `completed`. A saved view keeps the period itself, so a view of `completed = last week` always shows the previous week. People sharing a project may start their weeks on different days; each sees their own week.

`before` is the same as `<` and `after` the same as `>`. `today` on its own is the keyword (due today); `due = today` is the same comparison written out, and `due <= today` also includes overdue tasks. Only English weekday names are accepted.

### Labels and projects that change

Names are looked up every time the query runs, so renaming a label or project is picked up immediately. When several labels or projects share a name (two devices can create the same name while offline), the term matches any of them. A name that matches nothing is **not** an error: the view shows a warning such as `No label named "errands"`, that term matches no task, and the rest of the query still works. A saved or remembered query therefore survives a rename or deletion.

## Errors

A query that does not follow the grammar shows a message under the input, and the previous results stay on screen until the query is valid again. Positions count characters from 1:

| Query | Message |
| --- | --- |
| `@errand &` | `Expected a term after "&" at position 9` |
| `(p1 \| p2` | `Missing ")" at end of query` |
| `@work p1` | `Expected "&" or "\|" before "p1" at position 7` |
| `p1 & urgent` | `Unknown term "urgent" at position 6` |
| `p5` | `Priority must be p1, p2, p3 or p4 at position 1` |
| `due today` | `Expected a comparison (<, <=, =, >=, >, before or after) after "due" at position 1` |
| `due > 7` | `Expected "days", "weeks" or "months" after "7" at position 7` |
| `due = last year` | `Expected "week" or "month" after "last" at position 7` |
| `completed > 2 weeks` | `Expected "ago" after "weeks" at position 15` |
| `no &` | `Expected "date", "project", "labels", "time", "deadline", "start" or a field name after "no" at position 1` |
| `cost >` | `Expected a value after ">" at position 6` |

An empty query shows a short usage hint and no results.

## The Filter view

You can also type a query straight into the [search box](search.md) (<kbd>Ctrl</kbd>+<kbd>K</kbd>): it lists the matching tasks and offers to open them here.

- `g` then `f`, or **Filter** in the sidebar, opens the view with the cursor in the query input. Results update about 150 ms after you stop typing.
- Results are grouped by project: Inbox first, then projects in sidebar order, each heading showing the project's path (`Work › Client A`). Within a group, tasks are ordered by due date, then priority.
- **Enter** in the input runs the query at once and moves to the first result; **Esc** returns to the input. In the list, the usual keys work: `j` / `k`, Enter to open, `c` to complete, `1`–`4` for priority, `L` for labels, Delete.
- **↑ / ↓** in the input step through the last 20 distinct queries you ran on this device. The history lives in the browser's local storage for the app, is never synced, and is cleared when you sign out.

## Saving views

A query you come back to can be saved as a **view**: it keeps the query, how its results are grouped and sorted, and syncs to all your devices like your tasks do.

- **Save.** In the Filter view, press `s` while the results have focus (or click **Save filter**), type a name and press Enter. The view is created with the current query, grouped by project and sorted by due date, pinned to the sidebar under **Views**, and opened. Saving works offline; other devices show the view after they sync.
- **Edit.** Opening a view shows its query in an editable input (`/` jumps to it). Enter saves a changed query for every device, Esc discards the change. A query that does not parse shows the error and is not saved.
- **Group and sort.** The header of a view has three menus, reachable with Tab: **Group** (project, due date, priority, label, none), **Sort** (due date, priority, manual order, created, title) and **Direction**. Defaults are *group by project, sort by due date ascending, undated tasks last*. Grouping by due date shows *Overdue*, *Today*, *Tomorrow*, then each later date and finally *No date*; grouping by label lists a task under each of its labels. For priority, *descending* puts priority 1 first. These options are stored on the view and sync.
- **Sidebar.** The **Filters** group appears with your first saved filter. Pinned filters are listed under it with a live count of their open tasks, computed on the device. The `⋯` menu of a view renames, moves it up or down, unpins or deletes it, and sets it as this device's start view. `g` then `v` opens the overview of every view, pinned or not, where views can be pinned again.
- **Start view.** Each device can open on a different view: choose it in **Settings → General → Start view** or from a view's menu. The choice stays on the device (it is not synced). If the saved view is deleted, for example on another device, the app opens the Inbox and says so once.
- **Dashboards.** **New dashboard** in the overview creates a view that shows up to six other views side by side as panels, each with its name, open-task count and first ten tasks, updating live. Add panels from the header, reorder or remove them with **Arrange**. Tab / Shift+Tab move between panels, `j` / `k` select a task inside one, Enter opens it (or the view when nothing is selected) and `o` opens the panel's view. A panel whose view was deleted shows *View removed* with a button to remove it. Panels stack on narrow screens.

A saved view evaluates its query exactly like the Filter view: open tasks only unless `completed` or `open` appears, tasks of archived projects left out, unknown names reported as warnings. If a view was saved by a newer version with a term this version does not understand, it shows the parse error instead of wrong results. When two devices change the same view while offline, each option keeps the newer value: a grouping changed on one device and a sort changed on the other both survive. A dashboard's panel list is replaced as a whole, so concurrent panel edits keep the newer list. Scripts can manage views through `/api/v1/views` (see `docs/api.md`); the server checks that the query parses with the same grammar.

## Examples

### 1. Work due by tomorrow, high priority

```filter
@work & due <= tomorrow & p1
```

### 2. Anything overdue that is not filed in a project

```filter
overdue & no project
```

### 3. Errands or calls, outside the Work project

```filter
(@errand | @call) & !#Work
```

### 4. Everything under Work, including its sub-projects, due this week

```filter
##Work & due <= 6 days
```

### 5. Tasks for a client whose names contain spaces

```filter
#"Client A" & @"follow up"
```

### 6. Captured in the last week and still unscheduled

```filter
created > 7 days ago & no date
```

### 7. Due on Friday, either priority 1 or 2

```filter
due = friday & (p1 | p2)
```

### 8. Find a task by a phrase in its title or notes

```filter
search: "oat milk" | search: groceries
```

### 9. Completed subtasks of the Home project

```filter
#Home & subtask & completed
```

### 10. Due before the end of November, unlabelled, with no fixed time

```filter
due before 2026-12-01 & no labels & no time & !today
```

### 11. A deadline this week, but no plan yet

```filter
deadline <= 6 days & no date
```

### 12. Waiting on others, without the parked ones

```filter
@waiting & !someday
```

### 13. Waiting for (save it as a view)

```filter
blocked
```

### 14. What can be done today

```filter
unblocked & today
```

### 15. Habits still to do today

```filter
habit & due <= today
```

### 16. What I finished last week

```filter
completed = last week
```

### 17. Work done this month, high priority

```filter
##Work & completed >= this month & (p1 | p2)
```

### 18. Expensive renovation items ordered by Friday

```filter
#"Home renovation" & cost > 1000 & "Order date" <= friday
```

### 19. Quotes still missing a client

```filter
status = "Quote" & no client
```
