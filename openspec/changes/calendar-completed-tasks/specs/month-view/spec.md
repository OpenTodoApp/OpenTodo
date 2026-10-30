## MODIFIED Requirements

### Requirement: Month grid
The client SHALL provide a Month view, reachable by `g m`, from the sidebar and from the Day | Week | Month switch, showing the weeks of the anchor month starting on the user's first day of the week, with days outside the month dimmed and today marked. Each day SHALL list the open tasks due that day in the viewer's zone, with the same selection as Day and Week: deleted and archived-project tasks left out, completed tasks included only when the Calendar's Show completed tasks choice is on. Completed titles SHALL be struck through and announce their completed status, including the focused-day list on a phone, and SHALL be counted in visible task counts and overflow controls but not planned capacity. Completed tasks SHALL be selectable and openable, but SHALL NOT be rescheduled from the calendar. Identical task rows and the same visibility choice SHALL produce identical cells after sync. The view SHALL render from local data and work offline.

#### Scenario: Open the month offline
- **WHEN** the device is offline and the user presses `g m`
- **THEN** the current month renders with every open dated task in its day's cell

#### Scenario: Week start and zoned dues
- **WHEN** the first day of the week is `sun` and a task is due `02:00 Asia/Tokyo` on the 12th viewed from Berlin
- **THEN** each row of the grid starts on a Sunday and the task appears in the cell of the 11th

#### Scenario: Range switch keeps the date
- **WHEN** the user is on the Week view of 2026-11-18 and chooses Month
- **THEN** November 2026 opens, and choosing Day from there opens 2026-11-18

#### Scenario: Completed work in a month cell
- **WHEN** Show completed tasks is on and an open task and a completed task are due on the same day
- **THEN** both appear in the existing order, the completed title is struck through, only the open task counts towards capacity, and on a phone the count includes both and the focused-day list shows both
