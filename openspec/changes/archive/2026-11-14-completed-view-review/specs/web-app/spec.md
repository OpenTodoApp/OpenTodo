## MODIFIED Requirements

### Requirement: Completed logbook
The Completed view SHALL list completed tasks newest first, grouped by the logical day of completion ("Today", "Yesterday", then weekday and date, with the year outside the current year), each group with its count. It SHALL render the newest 100 and offer a keyboard-reachable "Show more" that renders the next 100, with no fixed cap. It SHALL be computed from local data, work offline and follow synced completions and reopenings.

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
