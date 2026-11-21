# Spec Delta

## MODIFIED Requirements

### Requirement: Task panel facets
The panel SHALL group the task's properties into four facet lines, each with a leading icon and parts separated by a middle dot: Where (project › section, the parent task, the origin), When (do on, repeat, deadline, start, evening, reminders, zone, completed), How (priority, estimate, labels) and Who (assignee, blocked by, blocks). Where, When and How SHALL always be shown; Who SHALL be shown when any of its parts has a value. A part SHALL read with the words the list row uses for the same fact. A completed plain task SHALL show its completion as a When part reading `Completed <date>, <time>`; a task with a recurrence rule or a series SHALL show no Completed part, because its completions live on occurrence records.

#### Scenario: Full task reads as four lines
- **WHEN** the user opens a task due tomorrow at 09:00 that repeats every 3 months, has a deadline in 9 days, a start two days ago, two reminders, priority 2, a 2 h estimate, three labels, is assigned to the user and waits for "Collect the numbers", in "Website launch › Doing"
- **THEN** the panel shows exactly four facet lines: "Website launch › Doing"; "Tomorrow 09:00 · every 3 months · deadline Sun 25 Oct, 9 days · since Wed 14 Oct · 2 reminders"; "P2 · 2 h" followed by the three label chips; "You · waits for Collect the numbers"

#### Scenario: Facet without values is hidden
- **WHEN** a task has no assignee, no blockers and nothing waits for it
- **THEN** no Who line is shown, and "Assignee" and "Blocked by" are offered in the Add menu

#### Scenario: Same words as the row
- **WHEN** a task is due today, repeats every day and is marked for the evening
- **THEN** its When line starts "Today · evening · every day", in the date tone the row uses

#### Scenario: Origin opens its source
- **WHEN** the user presses Enter on the origin part of a task captured from `https://example.org/post`
- **THEN** the page opens in a new tab, no editor opens, the panel stays as it was, and Remove origin in the panel's header menu clears the origin as one offline-capable write

#### Scenario: Viewer reads the lines
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the facet lines render as text, no part opens an editor, and the Add menu is absent

#### Scenario: Completed part on a completed task
- **WHEN** the user opens a task completed on 14 October at 12:00
- **THEN** the When line reads `Completed 14 Oct, 12:00 PM`

#### Scenario: No Completed part on a recurring task
- **WHEN** the user opens a completed task with a recurrence rule
- **THEN** the When line shows no Completed part

#### Scenario: Completed part opens its editor
- **WHEN** the user activates the Completed part
- **THEN** an editor opens with the completion's day and time of day prefilled, and picking a new day or time writes the new completion at once

#### Scenario: Future completion refused
- **WHEN** the user opens the Completed editor today
- **THEN** the day picker offers no day after today and the time picker offers no time later than now

#### Scenario: Clear reopens the task
- **WHEN** the user opens the Completed editor and chooses Clear
- **THEN** the task is reopened, the Completed part disappears, and the task leaves the Completed view

### Requirement: Completed logbook
The Completed view SHALL list completed tasks newest first, grouped by the logical day of completion ("Today", "Yesterday", then weekday and date, with the year outside the current year), each group with its count. It SHALL render the newest 100 and offer a keyboard-reachable "Show more" that renders the next 100, with no fixed cap. It SHALL be computed from local data, work offline and follow synced completions and reopenings. Editing a task's completion SHALL move it to the group of its new completion day.

Its display options SHALL offer Group by Day (the default) or Project, and the projects it is narrowed to, chosen with the Combobox with the Inbox among them; with none chosen it SHALL list every completion. Grouped by project, each project (the Inbox for tasks without one) SHALL be one group, in the order of its newest completion, with its rows newest first. A search field SHALL narrow the listed completions to those with every word of the search in the title or the notes, ignoring case and accents. Narrowing and search SHALL apply before the paging. The options SHALL be kept on the device, never synced; the search SHALL not be kept when the view is left. In this view a completed row SHALL show its check and a muted title without a strikethrough; other lists SHALL keep the strikethrough.

#### Scenario: Grouped by day
- **WHEN** the user completed two tasks today, one yesterday and one on Monday 2026-10-12, and today is Friday 2026-10-16
- **THEN** Completed shows "Today" with two tasks, "Yesterday" with one, then a heading for Monday 12 October with one

#### Scenario: Older history is reachable
- **WHEN** the user has 250 completed tasks and opens Completed
- **THEN** the newest 100 are listed with "Show more" naming 150 more, and pressing it twice lists all 250

#### Scenario: Offline and synced
- **WHEN** the device is offline, the user completes a task, and later another device's completion syncs in
- **THEN** each appears under its completion day without a reload, and reopening a task removes it from its group

#### Scenario: Completed after midnight with a day start
- **WHEN** the user's day start is `04:00` and a task was completed at 01:30 on Thursday 15 October
- **THEN** Completed lists it under Wednesday 14 October, and under "Today" while Wednesday is still the logical today

#### Scenario: A weekly review of two projects
- **WHEN** the user groups Completed by Project and chooses Work and the Inbox
- **THEN** it lists a Work group and an Inbox group, the one with the newest completion first, and no task of another project

#### Scenario: Search
- **WHEN** the user types "cafe invoice" in the search field
- **THEN** only completions with both words in the title or the notes are listed, a "Café invoice" among them, and clearing the field lists every completion again

#### Scenario: Readable done marker
- **WHEN** the user opens Completed
- **THEN** each row shows its check and a muted title without a strikethrough, while a project showing its completed tasks still strikes them through

#### Scenario: Kept on the device
- **WHEN** the user chooses Group by Project on one device and opens Completed on another
- **THEN** the other device shows its own choice, by day unless chosen there, and the first keeps Project after a reload, offline included

#### Scenario: Edited completion moves groups
- **WHEN** the user changes a task's completion from today to three days ago
- **THEN** Completed no longer lists it under "Today" and lists it under the group for three days ago, with the counts updated
