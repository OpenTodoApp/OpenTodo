# Spec Delta

## MODIFIED Requirements

### Requirement: Statistics are computed on the device
Statistics SHALL be derived from the device's local task and project rows, time entries and local activity record at the time they are shown. The device SHALL send nothing to the server to compute them, SHALL write nothing (no op, no cache that syncs), and SHALL show them offline. Because every device holds the same rows after sync, every device SHALL show the same numbers for the same period, with one exception: the "keeps slipping" panel reads the device's own activity record, which is not synced, and SHALL say so. There is nothing to converge.

#### Scenario: Offline
- **WHEN** the user opens Statistics without a connection
- **THEN** the numbers and charts are shown from local data with no offline notice and no request is attempted

#### Scenario: Two devices agree
- **WHEN** two synced devices open Statistics for last week
- **THEN** they show identical counts, charts and project breakdowns

#### Scenario: No request
- **WHEN** Statistics is opened and used for a period
- **THEN** no request other than ordinary sync leaves the device and the server holds no statistics

#### Scenario: Slipping list is per device
- **WHEN** a laptop that has been in use for months and a phone set up yesterday open Statistics
- **THEN** every other panel shows identical values, and the "keeps slipping" panel on each says it is based on this device's history and may list different tasks

### Requirement: Statistics screen
The web app SHALL show Statistics at `/stats`, reachable from the sidebar and by keyboard, with the period chooser as the first focusable control and the headline tiles before the charts. The page header SHALL hold the title, the period chooser and the menu; nothing SHALL stand between the header and the first panel. From 1024 px the panels SHALL flow in two columns and below it in one; the tiles SHALL wrap to two and then one per row. The page SHALL have one vertical scroller. The screen SHALL explain in one line that everything is computed on this device. A panel without data for the period SHALL collapse to one line saying what it needs, instead of an empty chart.

#### Scenario: Keyboard
- **WHEN** the user presses `g` then `Shift+S`, then Tab and the arrow keys
- **THEN** Statistics opens, the period chooser receives focus and the arrow keys change the period

#### Scenario: Empty history
- **WHEN** an account has completed nothing in the chosen period
- **THEN** the screen shows zeros and a short hint instead of empty charts

#### Scenario: Phone
- **WHEN** Statistics is opened at 390 px wide
- **THEN** the tiles show two per row, the panels stack in one column, the heatmap scrolls sideways inside its figure with the current week in view, and the page never scrolls sideways

## REMOVED Requirements

### Requirement: Periods and week start
**Reason**: The rolling "last 4 weeks" and "last 12 weeks" periods give way to calendar periods compared with the previous period ("Periods and comparison").
**Migration**: "This week" and "Last week" keep their meaning and boundaries. The quarter replaces the 12 weeks and the month replaces the 4 weeks. A device whose stored choice was a removed period opens on "This week".

### Requirement: Breakdowns and charts
**Reason**: Replaced by the dashboard panels ("Dashboard panels"), which keep every breakdown that answers a question (per day, per project, tracked per day and per project) and add new ones. This requirement must be removed after the time-tracking change, which modifies it, is archived.
**Migration**: Completions per day and per project, and tracked time per day and per project, appear in "Keeping up" and "Where time goes". The per-weekday chart becomes the weekday × hour panel. The per-week chart becomes the quarter's resolution of "Keeping up".

## ADDED Requirements

### Requirement: Periods and comparison
Statistics SHALL be shown for one of: this week, this month, this quarter, this year and last week, default this week. Days SHALL be the user's logical days (OpenSpec `date-time-preferences`, "Logical today"). A week SHALL start on the user's first day of the week preference, with the same boundaries as the filter periods `this week` and `last week`. Months, quarters and years SHALL be calendar units in logical days. A current period runs from its start up to now. Every figure SHALL be compared with the same number of days from the start of the previous unit (last week with the week before, in full), and the comparison SHALL be shown in words and with an arrow, never by colour alone, in text colours that do not judge a rise or a fall as good or bad.

#### Scenario: Sunday start
- **WHEN** the first day of the week is Sunday and today is Wednesday 2026-10-14
- **THEN** "this week" covers 2026-10-11 up to now and "last week" covers 2026-10-04 to 2026-10-10

#### Scenario: Month to date
- **WHEN** today is 2026-10-10 and the user picks this month
- **THEN** the period covers 1–10 October and every tile compares with 1–10 September, for example "+12 % vs last month"

#### Scenario: Week end at the day start
- **WHEN** the first day of the week is Monday, the day start is `04:00` and it is 02:00 on Monday 2026-10-19
- **THEN** "this week" is still the week of 2026-10-12 and a task completed now counts in it, not in the next week

#### Scenario: Stored period no longer offered
- **WHEN** a device last showed "last 12 weeks" before this change
- **THEN** Statistics opens on this week and nothing is written to sync

### Requirement: Headline tiles
The dashboard SHALL open with four tiles for the period:
- **Done:** completions, as counted today.
- **On time:** of the completions in the period whose task had a due date, the share completed on or before the logical day of that due date.
- **Streak:** the number of consecutive logical days ending today, or yesterday when nothing is completed yet today, with at least one counted completion. The tile also shows the best run within the last 53 weeks.
- **Tracked:** the user's tracked time in the period against the summed estimates of the tasks it was tracked on, each task counted once, with how many tracked tasks have no estimate.

Each tile SHALL show its change against the comparison period. A tile with nothing to measure SHALL show "–" with a reason.

#### Scenario: On time
- **WHEN** this week holds ten completions of tasks with a due date, eight on or before their due day, and four completions without a due date
- **THEN** On time reads 80 % and the four undated completions are not part of it

#### Scenario: Streak across the day start
- **WHEN** the day start is `04:00`, the user completed something on each of the last six logical days, and today's only completion was at 02:30 (counted for yesterday)
- **THEN** the streak reads 6 and is not broken until the end of today's logical day

#### Scenario: Tracked without estimates
- **WHEN** 5 h were tracked this week on three tasks, two with estimates of 2 h and 1 h and one without
- **THEN** the Tracked tile reads 5 h against 3 h estimated and says one tracked task has no estimate

#### Scenario: No due dates
- **WHEN** no task completed in the period had a due date
- **THEN** On time shows "–" and says there were no due dates in this period

### Requirement: Dashboard panels
Below the tiles the dashboard SHALL show these panels, each headed by the question it answers:
- **Keeping up:** completions and creations over the period as two lines, per day up to a month, per week for a quarter, per month for a year. The two lines are told apart by direct labels and line style as well as colour.
- **Where time goes:** the user's tracked time per project, the five projects with most time, then "other", tasks without a project as "Inbox". When the period holds no tracked time, completions per project with the same top-five rule.
- **A year of done tasks:** completions per logical day for the 53 weeks ending today, whatever the period, as a grid of weeks with five shades.
- **When you get things done:** completions in the period by logical weekday and local clock hour, with the hours laid out from the day start.
- **Estimates:** for tasks completed in the period that had an estimate and at least 5 minutes of the user's own tracked time, the median of tracked ÷ estimate in one sentence, and the up to three projects or labels with at least three such tasks whose median is furthest from 1.
- **Keeps slipping:** open live tasks whose due date this device's activity record shows was moved later or removed three or more times in the last 90 days, each linking to the task.

All panels SHALL count by the existing rules for what is counted, excluded rows and whose tasks count in shared projects. Only the user's own time entries count. Charts SHALL be drawn on the device without a chart image from a library, SHALL follow light and dark themes, and SHALL never convey a value by colour alone.

#### Scenario: Keeping up for a quarter
- **WHEN** the user picks this quarter in its fifth week
- **THEN** "Keeping up" shows five weekly points for completed and for created, labelled at the line ends, with the comparison to the first five weeks of the previous quarter in the tiles

#### Scenario: Project breakdown
- **WHEN** the user completed tasks in seven projects this month and tracked no time
- **THEN** "Where time goes" names five projects with their completion counts and sums the rest as "other", in descending order

#### Scenario: Tracked per project
- **WHEN** this week holds entries on tasks of "Client A" (3 h) and the Inbox (40 m)
- **THEN** "Where time goes" lists "Client A 3h" and "Inbox 40m"

#### Scenario: Heatmap independent of the period
- **WHEN** the user switches from this week to this year
- **THEN** "A year of done tasks" keeps showing the same 53 weeks and only the other panels change

#### Scenario: Weekday and hour with a day start
- **WHEN** the day start is `04:00` and a task was completed on Thursday at 01:30
- **THEN** it counts on Wednesday's row in the 01:00 column, which is laid out after 23:00

#### Scenario: Estimates need enough tasks
- **WHEN** only two tasks completed this month had both an estimate and tracked time
- **THEN** the Estimates panel collapses to one line saying it needs at least three tracked tasks with estimates

#### Scenario: Keeps slipping
- **WHEN** a task's due date was moved later on 1, 8 and 15 October on this device and it is still open
- **THEN** it is listed under "Keeps slipping" with its project, and activating it opens the task

#### Scenario: Shared project
- **WHEN** another member completed a task assigned to the user in a shared project
- **THEN** it counts in no panel for the user, as in the headline counts

### Requirement: Accessible charts
Every chart SHALL be a figure with a heading, a one-sentence summary as its accessible name, and a "Show as table" control that shows the same values as a data table. Marks that carry a value (line points, heatmap days, dots, bars) SHALL be reachable by keyboard as one grid per chart, moved through with the arrow keys, and the focused mark SHALL show the same tooltip a pointer gets. Hit targets SHALL be at least 24 × 24 px. On touch a tap SHALL show the tooltip. With forced colours, the table SHALL be shown.

#### Scenario: Screen reader
- **WHEN** a screen reader user reaches "A year of done tasks"
- **THEN** it reads the panel's summary (total, busiest day, current streak), and "Show as table" exposes one row per month with the completions per day

#### Scenario: Keyboard through the heatmap
- **WHEN** the user focuses the heatmap and presses the left arrow twice
- **THEN** focus moves two days back and the tooltip reads, for example, "Tue 14 Oct: 5 completed"

#### Scenario: Colour not alone
- **WHEN** the dashboard is viewed in greyscale
- **THEN** completed and created stay distinguishable by line style and labels, and every heatmap value can be read from its tooltip or the table

### Requirement: Dashboard on large accounts
The dashboard SHALL compute every panel from one pass over the counted rows for the 53-week window. Changing the period SHALL not re-read the rows. It SHALL become usable without visible delay on an account with 20,000 tasks and 5,000 time entries, and SHALL show the tiles first if a panel is still being computed.

#### Scenario: Period change
- **WHEN** an account with 20,000 tasks switches from this week to this year
- **THEN** the panels update without reading the task table again and the period chooser stays responsive
