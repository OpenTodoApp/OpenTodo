## Purpose
A Year mode of the Calendar destination: twelve compact month grids with a density mark per day, for seeing a whole year of planned work at a glance and jumping from it to a month or a day, offline and with the keyboard alone.

## ADDED Requirements

### Requirement: Year view
The client SHALL provide a Year mode of the Calendar destination, reachable by `g y`, from the Day | Week | Month | Plan | Year switch and from the sidebar's Calendar item when it was the last mode used on the device, showing the twelve months of the anchor date's year as compact month grids starting on the user's first day of the week, today marked and days before today in the faint tone. Switching to and from Year SHALL keep the anchor date. The view SHALL render from local data, work offline and write nothing.

#### Scenario: Open the year offline
- **WHEN** the device is offline and the user presses `g y` on 18 November 2026
- **THEN** the twelve months of 2026 render with their density marks, and the sidebar's Calendar item opens Year from then on

#### Scenario: Switch keeps the date
- **WHEN** the user is on the Year of 2026 with 3 March focused and chooses Month
- **THEN** March 2026 opens

#### Scenario: Week start
- **WHEN** the first day of the week is `sun`
- **THEN** every month grid of the Year starts its rows on Sunday

### Requirement: Density per day
Each day of the Year SHALL carry a density mark in four steps from the day's count: none for 0, then 1–2, 3–5, and 6 or more, drawn from the sequential chart tokens and distinguishable without colour. The count SHALL be the open tasks due that day in the viewer's zone with the Month's selection, plus the projected occurrences of recurring tasks on that day while the device's "Show repeating occurrences" switch is on (OpenSpec `recurring-tasks`, "Projected occurrences in the calendar"), plus one for each task drawn as a span that covers the day (OpenSpec `multi-day-tasks`). Subscribed calendar events and deadlines SHALL not count. A day whose counted estimates exceed the device's day length SHALL carry an over-capacity mark in the danger tone. Each day's accessible name SHALL state its date, count and over-capacity state, and hovering or focusing a day SHALL show its count and up to three task titles.

#### Scenario: Steps
- **WHEN** 2 November has no task, the 3rd two, the 4th four and the 5th seven
- **THEN** the 2nd has no mark, and the 3rd, 4th and 5th show the first, second and third step

#### Scenario: Recurring and spanning tasks count
- **WHEN** a task with `every monday` is due Monday 2 November, "Show repeating occurrences" is on, and a span covers 10 to 12 November
- **THEN** every Monday from 2 November on counts one, and the 10th, 11th and 12th each count one

#### Scenario: Events do not count
- **WHEN** a day holds three meetings from a subscribed calendar and no task
- **THEN** the day has no density mark

#### Scenario: Over capacity
- **WHEN** a day's counted estimates total 9 hours with an 8-hour day length
- **THEN** the day shows the over-capacity mark and its accessible name says "over capacity"

#### Scenario: Screen reader
- **WHEN** a screen reader user moves to 4 November with four tasks
- **THEN** it is announced as "4 November, 4 tasks"

### Requirement: Navigating from the year
Activating a day SHALL open the Day view on that day; activating a month's name SHALL open Month on that month. The twelve grids SHALL form one keyboard grid with one tab stop: Left and Right move a day and Up and Down a week across month edges, Page Up and Page Down move to the same day of the previous or next month (clamped to its length), Home and End to the first and last day of the focused month, `[` and `]` to the previous or next year keeping the day, `t` to today, Enter opens the focused day in Day view, and Escape returns focus to the page header. The shortcuts SHALL be registered in the shortcut registry without conflict. No action SHALL require a pointer. The Year view SHALL not move tasks.

#### Scenario: From year to day with the keyboard
- **WHEN** the Year of 2026 is open with today focused, and the user presses Page Down twice, Right and Enter
- **THEN** the Day view opens on the day after the same date two months later

#### Scenario: Across a month edge
- **WHEN** 31 January is focused and the user presses Right
- **THEN** 1 February is focused

#### Scenario: Next year
- **WHEN** 18 November 2026 is focused and the user presses `]`
- **THEN** the Year of 2027 shows with 18 November 2027 focused

### Requirement: Year on narrow screens
Below 768 px the Year SHALL show the months in two columns, and below 640 px a month SHALL be the touch target: tapping it opens Month on that month. Nothing SHALL overflow horizontally at 360 px, including German and French month names.

#### Scenario: Year on a phone
- **WHEN** the user opens Year on a 390 px screen and taps the March grid
- **THEN** the twelve months were shown in two columns with their marks, and Month opens on March

### Requirement: Year view performance
The Year view SHALL compute its counts in one pass over the local tasks and SHALL count projected occurrences without building rows for them, rendering within 100 ms for 10,000 open tasks and 50 daily recurring series on the reference test runner. Changing the year SHALL recompute only the counts.

#### Scenario: Large account
- **WHEN** the device holds 10,000 open dated tasks and 50 series with `every day`, and the user opens Year
- **THEN** the view renders within the budget and the marks match the per-day counts the Month shows
