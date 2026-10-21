# filter-queries Specification

## Purpose
Defines a small query language for selecting tasks by label, project, priority, date, state and text, evaluated entirely on the device from local data, with a documented grammar and predictable error messages.

## Requirements

### Requirement: Query grammar
A query SHALL be a boolean expression over terms combined with `&` (and), `|` (or), `!` (not) and parentheses, where `!` binds tightest, then `&`, then `|`. Whitespace between tokens SHALL be ignored. Names containing spaces or operator characters SHALL be written in double quotes. Matching of names and keywords SHALL ignore case. The grammar SHALL be published in the documentation and the client SHALL accept exactly that grammar.

#### Scenario: Precedence
- **WHEN** the user enters `@errand | @call & p1`
- **THEN** it is evaluated as `@errand | (@call & p1)`

#### Scenario: Grouping and negation
- **WHEN** the user enters `(@errand | @call) & !#Work`
- **THEN** tasks carrying either label and not in project "Work" are listed

#### Scenario: Quoted names
- **WHEN** the user enters `#"Client A" & @"follow up"`
- **THEN** the project named "Client A" and the label named "follow up" are matched, ignoring case

### Requirement: Custom field terms in the grammar
The grammar SHALL include a custom field term `name cmp value` and `no name` (OpenSpec `custom-fields`), where `name` is a bare word that is not a reserved word of the grammar, or any quoted name. Reserved words (`due`, `created`, `deadline`, `start`, `completed`, `no`, the keywords and `p1` to `p4`) SHALL keep their meaning, so a field with such a name is reachable only through its quoted name.

#### Scenario: Field term with a quoted name
- **WHEN** the user enters `"Order date" <= friday & cost > 100`
- **THEN** both terms are parsed as field terms and combined with `&`

#### Scenario: Reserved words stay reserved
- **WHEN** a project defines a field named "due" and the user enters `due <= tomorrow`
- **THEN** the term is the due-date term, and the field is reachable only through its quoted name

### Requirement: Label and project terms
`@name` SHALL match tasks carrying the label with that name. `#name` SHALL match tasks whose project has that name and `##name` SHALL also match tasks in that project's descendants. `no labels` and `no project` SHALL match tasks with an empty label array or no project. When several labels or projects share a name, the term SHALL match any of them.

#### Scenario: Label term
- **WHEN** the user enters `@errand`
- **THEN** every open task whose labels include the label named "errand" is listed and no other

#### Scenario: Project with descendants
- **WHEN** "Work" contains "Client A" and the user enters `##Work`
- **THEN** open tasks of "Work" and of "Client A" are listed, while `#Work` lists only tasks of "Work"

#### Scenario: Inbox tasks
- **WHEN** the user enters `no project & p1`
- **THEN** priority-1 tasks without a project are listed

### Requirement: Date terms
`due` and `created` SHALL accept `<`, `<=`, `=`, `>=`, `>`, `before` and `after` against a date expression: `today`, `tomorrow`, `yesterday`, a weekday name (next occurrence including today), an ISO date, `N days` / `N days ago`, or a period (see "Period date expressions"). Comparisons SHALL use the viewer's local calendar date; a task without a due date SHALL never match a `due` comparison. `no date`, `overdue`, `today` and `tomorrow` SHALL be keywords.

#### Scenario: Due by tomorrow
- **WHEN** today is 2026-10-10 and the user enters `due <= tomorrow`
- **THEN** open tasks due on or before 2026-10-11 are listed, including overdue ones, and tasks without a due date are not

#### Scenario: Weekday expression
- **WHEN** today is Saturday 2026-10-10 and the user enters `due = friday`
- **THEN** tasks due on 2026-10-16 are listed

#### Scenario: Relative creation date
- **WHEN** the user enters `created > 7 days ago & no date`
- **THEN** tasks created within the last seven days that have no due date are listed

### Requirement: Period date expressions
`this|last|next week`, `this|last|next month`, `N weeks ago` and `N months ago` SHALL be ranges of days in every date term; weeks SHALL start on the user's first day of the week, months SHALL be calendar months, and a day SHALL be a one-day range. Against a range, `=` SHALL match days within it, `<` days before it, `<=` up to its end, `>` after it and `>=` from its start. Stored queries SHALL keep the period; evaluation SHALL stay on the device and agree across the user's devices.

#### Scenario: This week with a Monday start
- **WHEN** the first day of the week is Monday, today is Friday 2026-10-16 and the user enters `due = this week`
- **THEN** open tasks due from 2026-10-12 to 2026-10-18 are listed

#### Scenario: This week with a Sunday start
- **WHEN** the first day of the week is Sunday, today is Friday 2026-10-16 and the user enters `due = this week`
- **THEN** open tasks due from 2026-10-11 to 2026-10-17 are listed

#### Scenario: Comparisons against a period
- **WHEN** today is 2026-10-16 and the user enters `due >= last month & due < this month`
- **THEN** open tasks due from 2026-09-01 to 2026-09-30 are listed, and `due <= last month` also lists those due earlier

#### Scenario: Month boundaries
- **WHEN** today is 2026-03-31 and the user enters `created = last month`
- **THEN** tasks created from 2026-02-01 to 2026-02-28 in the viewer's zone are listed, and `created = 2 months ago` covers 2026-01-01 to 2026-01-31

#### Scenario: Saved period view offline
- **WHEN** a view with the query `deadline = next week` is saved on one device and another device opens it while offline a week later
- **THEN** the second device lists tasks whose deadline falls in the week after its current week, from local data

### Requirement: Priority, state and search terms
`p1` to `p4` SHALL match the task priority. `completed` SHALL include completed tasks and `open` only open ones; a query without either, and without a `completed` date term, SHALL match open tasks only. `subtask` SHALL match tasks that have a parent. `search: text` SHALL match tasks whose title or description contains the text ignoring case, with quotes allowed for several words. Deleted tasks SHALL never match any query.

#### Scenario: Default to open tasks
- **WHEN** the user enters `p1`
- **THEN** only open priority-1 tasks are listed, and `p1 & completed` lists only completed ones

#### Scenario: Text search
- **WHEN** the user enters `search: "oat milk"`
- **THEN** tasks whose title or description contains "oat milk" in any letter case are listed

#### Scenario: A completion date term includes completed tasks
- **WHEN** the user enters `#Work & completed >= this week`
- **THEN** the tasks of "Work" completed this week are listed, although the query has no `completed` or `open` keyword

### Requirement: Habit terms
`habit` SHALL match tasks flagged as habits (OpenSpec `habits`). A skipped occurrence record of a habit SHALL match neither `completed` nor `open`, and so no query at all.

#### Scenario: Habits
- **WHEN** the user enters `habit & due <= today`
- **THEN** the open habits due today or overdue are listed, evaluated on the device like every query

#### Scenario: Skipped records never match
- **WHEN** a habit was skipped yesterday and the user enters `completed`
- **THEN** yesterday's skipped record is not listed, while a day the habit was done is

### Requirement: Client-side live evaluation
Queries SHALL be evaluated on the device from local data and SHALL never require a network request. Results SHALL update live as local or synced changes arrive. Evaluation of a query over a few thousand tasks SHALL complete fast enough to keep typing responsive, and the client SHALL debounce evaluation while the user types.

#### Scenario: Works offline
- **WHEN** the device is offline and the user enters `overdue & #Home`
- **THEN** the matching tasks are listed from local data with no error

#### Scenario: Results follow sync
- **WHEN** a query is displayed and another device completes one of the listed tasks, then this device syncs
- **THEN** the task leaves the results without a reload

### Requirement: Errors and warnings
A syntax error SHALL be reported under the input with the character position and what was expected, and SHALL leave the previous results visible. A label or project name that matches nothing SHALL produce a warning naming it, and that term SHALL evaluate to no match instead of failing the query. An empty query SHALL show the usage hint and no results.

#### Scenario: Syntax error
- **WHEN** the user enters `@errand &`
- **THEN** the message reads `Expected a term after "&" at position 9` and the list below is unchanged

#### Scenario: Unmatched parenthesis
- **WHEN** the user enters `(p1 | p2`
- **THEN** the message reads `Missing ")" at end of query`

#### Scenario: Unknown name warns
- **WHEN** the user enters `@errands | p1` and no label is named "errands"
- **THEN** a warning reads `No label named "errands"` and the priority-1 tasks are still listed

### Requirement: Filter view
The client SHALL provide a Filter view opened with `g f`, from the sidebar's More group and from the Filters group's "New" action, using the page header (title "Filter", actions Save as filter and Help) with a query input, the usage hint shown while the input is empty and collapsible otherwise, the error or warning line, and live results grouped by project with the standard task rows and keyboard navigation.

#### Scenario: Open and run a query
- **WHEN** the user presses `g f`, types `@work & due <= tomorrow & p1` and presses Enter
- **THEN** the matching tasks are grouped by project and the first result is selected

#### Scenario: Hint folds away
- **WHEN** the user has typed a query that returns results
- **THEN** the usage hint collapses to one line with a control to expand it, and the results start directly below the input

### Requirement: Filter query history and input focus
The Filter view SHALL keep a per-device history of the last 20 distinct queries, available with Up/Down in the input. Pressing Enter in the input moves focus to the first result; Escape returns to the input.

#### Scenario: History is local
- **WHEN** the user reloads the app on the same device and presses Up in the empty filter input
- **THEN** the previous query is recalled, and another device shows no history from this one

#### Scenario: Escape returns to the input
- **WHEN** the first result is selected after pressing Enter in the query input and the user presses Escape
- **THEN** focus returns to the query input and the query text is kept

### Requirement: Deadline terms
`deadline` SHALL accept the same comparisons and date expressions as `due` (`<`, `<=`, `=`, `>=`, `>`, `before`, `after` against `today`, `tomorrow`, `yesterday`, a weekday name, an ISO date, `N days` or `N days ago`), compared on the viewer's local calendar date. A task without a deadline SHALL never match a `deadline` comparison. `no deadline` SHALL be a keyword matching tasks without one. Evaluation SHALL stay on the device, from local data, with no network request.

#### Scenario: Deadlines in the next three days
- **WHEN** today is 2026-10-14 and the user enters `deadline <= 3 days`
- **THEN** open tasks with a deadline on or before 2026-10-17 are listed, including ones whose deadline has passed, and tasks without a deadline are not

#### Scenario: No deadline
- **WHEN** the user enters `#Work & no deadline`
- **THEN** open tasks of "Work" without a deadline are listed

#### Scenario: Deadline but no plan
- **WHEN** the user enters `deadline >= today & no date`
- **THEN** open tasks with a deadline today or later that have no due date are listed

#### Scenario: Saved view syncs and evaluates offline
- **WHEN** a view with the query `deadline <= 7 days` is saved on one device and another device opens it while offline
- **THEN** the second device lists its matching tasks from local data and shows a live count in the sidebar

### Requirement: Start, Someday and evening terms
`someday` SHALL match parked tasks, `deferred` tasks whose start date is after the viewer's local date, and `evening` tasks with the evening flag. `start` SHALL accept the comparisons and date expressions of `due` on the viewer's local calendar date; a task without a start date SHALL never match it. `no start` SHALL match a null start. Queries SHALL keep matching parked and deferred tasks unless a term excludes them, evaluated on the device from local data.

#### Scenario: Waiting-for list without parked tasks
- **WHEN** the user enters `@waiting & !someday`
- **THEN** open tasks labelled "waiting" that are not parked are listed, including deferred ones

#### Scenario: Starting this week
- **WHEN** today is 2026-10-14 and the user enters `deferred & start <= 6 days`
- **THEN** open tasks with a start date from 2026-10-15 to 2026-10-20 are listed, and parked tasks are not

#### Scenario: Evening tasks in a project
- **WHEN** the user enters `#Home & evening`
- **THEN** open tasks of "Home" with the evening flag are listed, whatever their date

#### Scenario: Saved view offline
- **WHEN** a view with the query `someday & #Ideas` is opened on a device that is offline
- **THEN** the parked tasks of "Ideas" are listed from local data and the sidebar shows their count

### Requirement: Dependency terms
`blocked` SHALL match tasks that have at least one open blocker (OpenSpec `task-dependencies`) and `unblocked` SHALL match tasks that have none, both evaluated from local data with the same open-only default as every other term. Both SHALL be keywords in the published grammar.

#### Scenario: Waiting-for list offline
- **WHEN** the device is offline and the user enters `blocked`
- **THEN** every open task with an open blocker is listed, and tasks whose blockers are all completed are not

#### Scenario: What can be done today
- **WHEN** the user enters `unblocked & today`
- **THEN** only today's open tasks without an open blocker are listed

#### Scenario: Blocker completed on another device
- **WHEN** `unblocked` is displayed, another device completes a task's last open blocker, and this device syncs
- **THEN** the task appears in the results without a reload

### Requirement: Completion date terms
`completed` followed by a comparison and a date expression SHALL compare the viewer's local calendar day of the task's completion time, with the same expressions and range rules as the other date terms; without a comparison `completed` SHALL remain the state keyword. An open task SHALL never match it; completed occurrences of recurring tasks SHALL match. Evaluation SHALL stay on the device from local data and follow synced completions and reopenings.

#### Scenario: What I did last week
- **WHEN** the first day of the week is Monday, today is 2026-10-16 and the user enters `completed = last week`
- **THEN** tasks completed from Monday 2026-10-05 00:00 to Sunday 2026-10-11 23:59 in the viewer's zone are listed, and open tasks are not

#### Scenario: Last seven days
- **WHEN** the user enters `completed >= 7 days ago & #Home`
- **THEN** tasks of "Home" completed on any of the last seven days or today are listed

#### Scenario: Reopened on another device
- **WHEN** `completed >= this month` is displayed and another device reopens one of the listed tasks, then this device syncs
- **THEN** the task leaves the results without a reload

#### Scenario: Missing comparison value
- **WHEN** the user enters `completed after`
- **THEN** the message reads `Expected a date after "after" at position 11`

### Requirement: Origin terms
`origin` SHALL match tasks that have an origin, `no origin` tasks that have none, and `origin: value` (quotes allowed) tasks whose origin `provider` equals the value ignoring case, or, for an origin without a provider, whose `kind` does. All three SHALL be keywords in the published grammar, accepted by the server's validation of saved views and evaluated on the device from local data with the same open-only default as every other term; `origin` SHALL be a reserved word.

#### Scenario: Everything from one tracker
- **WHEN** the user enters `origin: github & open`
- **THEN** the open tasks whose origin provider is `github` are listed, and a task captured from a page without a recognised provider is not

#### Scenario: Captured pages and mails
- **WHEN** the user enters `origin: url | origin: email`
- **THEN** tasks captured from pages without a recognised provider and tasks created from email are listed

#### Scenario: Nothing imported
- **WHEN** the user enters `no origin & #Work`
- **THEN** the open tasks of "Work" without an origin are listed, and saving the query as a view is accepted by the server

#### Scenario: Offline and encrypted
- **WHEN** the device is offline, the account is end-to-end encrypted and unlocked, and the user enters `origin`
- **THEN** every open task with an origin is listed from the decrypted local copy, with no request

#### Scenario: Reserved word
- **WHEN** a project defines a custom field named "origin" and the user enters `origin`
- **THEN** the term is the origin keyword, and the field is reachable only through its quoted name
