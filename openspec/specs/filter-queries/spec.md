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
`due` and `created` SHALL accept `<`, `<=`, `=`, `>=`, `>`, `before` and `after` against a date expression: `today`, `tomorrow`, `yesterday`, a weekday name (next occurrence including today), an ISO date, or `N days` / `N days ago`. Comparisons SHALL use the viewer's local calendar date; a task without a due date SHALL never match a `due` comparison. `no date`, `overdue`, `today` and `tomorrow` SHALL be keywords.

#### Scenario: Due by tomorrow
- **WHEN** today is 2026-10-10 and the user enters `due <= tomorrow`
- **THEN** open tasks due on or before 2026-10-11 are listed, including overdue ones, and tasks without a due date are not

#### Scenario: Weekday expression
- **WHEN** today is Saturday 2026-10-10 and the user enters `due = friday`
- **THEN** tasks due on 2026-10-16 are listed

#### Scenario: Relative creation date
- **WHEN** the user enters `created > 7 days ago & no date`
- **THEN** tasks created within the last seven days that have no due date are listed

### Requirement: Priority, state and search terms
`p1` to `p4` SHALL match the task priority. `completed` SHALL include completed tasks and `open` only open ones; a query without either SHALL match open tasks only. `subtask` SHALL match tasks that have a parent. `search: text` SHALL match tasks whose title or description contains the text ignoring case, with quotes allowed for several words. Deleted tasks SHALL never match any query.

#### Scenario: Default to open tasks
- **WHEN** the user enters `p1`
- **THEN** only open priority-1 tasks are listed, and `p1 & completed` lists only completed ones

#### Scenario: Text search
- **WHEN** the user enters `search: "oat milk"`
- **THEN** tasks whose title or description contains "oat milk" in any letter case are listed

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
The client SHALL provide a Filter view opened with `g f` and from the sidebar, containing a query input with the usage hint, the error or warning line, live results grouped by project with the standard task rows and keyboard navigation, and a per-device history of the last 20 distinct queries available with Up/Down in the input. Pressing Enter in the input moves focus to the first result; Escape returns to the input.

#### Scenario: Open and run a query
- **WHEN** the user presses `g f`, types `@work & due <= tomorrow & p1` and presses Enter
- **THEN** the matching tasks are grouped by project and the first result is selected

#### Scenario: History is local
- **WHEN** the user reloads the app on the same device and presses Up in the empty filter input
- **THEN** the previous query is recalled, and another device shows no history from this one
