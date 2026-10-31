## MODIFIED Requirements

### Requirement: Month grid
The client SHALL provide a Month view, reachable by `g m`, from the sidebar and from the Day | Week | Month | Plan | Year switch, showing the weeks of the anchor month starting on the user's first day of the week, with days outside the month dimmed and today marked. The view SHALL show 1, 2, 3 or 6 consecutive months starting with the anchor month, 1 by default, chosen from the page's menu per device and never synced; with more than one month, the months SHALL be stacked one below the other, each headed by its name, the page title SHALL name the range, and days outside each month SHALL be empty cells so that no day appears twice. Each day SHALL list the open tasks due that day in the viewer's zone, with the same selection as Day and Week: deleted and archived-project tasks left out, completed tasks included only when the Calendar's Show completed tasks choice is on. Completed titles SHALL be struck through and announce their completed status, including the focused-day list on a phone, and SHALL be counted in visible task counts and overflow controls but not planned capacity. Completed tasks SHALL be selectable and openable, but SHALL NOT be rescheduled from the calendar. Identical task rows and the same visibility choice SHALL produce identical cells after sync. The view SHALL render from local data and work offline.

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

#### Scenario: Three months on this device
- **WHEN** the user chooses "Months shown: 3" from the page's menu in November 2026 and reloads
- **THEN** November, December and January are stacked with their names, the title reads "Nov 2026 – Jan 2027", 30 November appears only in November's grid, and another device still shows one month

### Requirement: Keyboard in the month
The grid SHALL be a keyboard grid: with no task selected, arrows move the focused day; `j` and `k` select the next and previous task of the month in grid order; Enter opens the selected task; `q` quick-adds a task due on the focused day; Escape clears the selection; `[`, `]` and `t` go to the previous month, the next month and today. With several months shown, the arrows and `j` and `k` SHALL continue across the stacked months in date order, `[` and `]` SHALL move the shown months by one month, and `t` SHALL show the current month first. No action SHALL require a pointer.

#### Scenario: Add on a day
- **WHEN** the user focuses the 15th with the arrows and presses `q`, types "Dentist" and presses Enter
- **THEN** a task "Dentist" due on the 15th appears in that cell with no network round trip

#### Scenario: Select and open
- **WHEN** the user presses `j` twice and Enter
- **THEN** the second task of the month in grid order opens in the detail panel

#### Scenario: Across stacked months
- **WHEN** two months are shown, 30 November is focused and the user presses Right
- **THEN** 1 December is focused in the second grid

#### Scenario: Step one month
- **WHEN** November to January is shown and the user presses `]`
- **THEN** December to February is shown

### Requirement: Month on narrow screens
Below 640 px the grid SHALL show each day's task count instead of titles, and the focused day's tasks SHALL be listed under the grid with the same rows, selection and actions as a list. Below 640 px one month SHALL be shown whatever the months shown on the device, and the setting SHALL be kept for wider screens. Nothing SHALL overflow horizontally.

#### Scenario: Phone layout
- **WHEN** the Month view is opened at 360 px width
- **THEN** the seven columns fit without horizontal scroll, each day shows its count, and tapping a day lists its tasks below the grid

#### Scenario: Several months on a phone
- **WHEN** the device shows three months and the window narrows to 390 px
- **THEN** one month is shown with the focused day's list under it, and widening the window shows three months again
