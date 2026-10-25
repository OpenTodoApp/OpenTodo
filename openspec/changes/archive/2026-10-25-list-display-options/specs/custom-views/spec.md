## MODIFIED Requirements

### Requirement: Grouping and sort options
A list view SHALL group its results by project, due date, priority, label or none, and sort within groups by due date, priority, position, created time, deadline or title, ascending or descending, as stored on the view; under a deadline sort, tasks without a deadline come last in either direction. Defaults SHALL be grouping by project and sort by due date ascending with undated tasks last. Options SHALL be changeable from the view's display panel (see "Display panel") with the keyboard; the sort direction is under its "More options". The New view page SHALL group and sort the same way, so a saved view shows what was seen before saving.

#### Scenario: Group by due date
- **WHEN** the user sets grouping to due date on "Work tomorrow"
- **THEN** results are shown under "Earlier", "Today" and "Tomorrow" headings in that order

#### Scenario: Sort by priority descending within groups
- **WHEN** sort is set to priority with descending direction
- **THEN** within each group priority-1 tasks come first and priority-4 last

#### Scenario: Same order before and after saving
- **WHEN** the user groups the New view page's results by priority and orders them by title, then saves the view
- **THEN** the saved view shows the same groups in the same order

#### Scenario: Sort by deadline
- **WHEN** the user orders "Work tomorrow" by deadline
- **THEN** tasks with the nearest deadline come first and tasks without a deadline last
