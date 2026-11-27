# Spec Delta

## ADDED Requirements

### Requirement: The week board
While Habits is on, the Habits screen from 640 px up SHALL use the width of the window and show its open habits as a week board: a column per day of the seven days ending on the logical today, headed with the weekday and the date and today marked, and per habit one row with its colour, title, anchor and measure, a mark per day, its current streak and its menu, in the groups of the part of the day. A day's mark SHALL draw the day's state, differing by shape as well as colour, and SHALL be named with its date and state. Today's mark SHALL check in, take back or add a step exactly as the check button does. An earlier scheduled day's mark SHALL set the day to done, or clear a done or tiny day, without moving the habit; an amount habit's mark SHALL open Set amount for that day. A day the habit does not repeat SHALL not be a control. Every change SHALL be one batch with one Undo, SHALL work offline and SHALL converge as the same change does elsewhere. Below 640 px the screen SHALL keep its rows.

#### Scenario: Tick yesterday from the board
- **WHEN** the person opens Habits at 1280 px and clicks yesterday's mark of Stretch, which was missed
- **THEN** yesterday's Stretch is done, its mark fills, Stretch is not moved, and one Undo reverts it

#### Scenario: Today on the board
- **WHEN** the person clicks today's mark of Read
- **THEN** Read is checked in for today and the mark is pressed; a second click takes the check-in back

#### Scenario: A day off
- **WHEN** Run repeats `every mon, wed, fri` and the board shows a Tuesday
- **THEN** Run's Tuesday is a small dot that cannot be pressed

#### Scenario: Narrow
- **WHEN** the window is 600 px wide with the phone screens off
- **THEN** the screen shows the habit rows, not the board

### Requirement: The week at a glance
While Habits is on and at least one habit is open, the Habits screen SHALL show above its habits a row of three tiles: **Today**, a ring and how many of today's due habits are kept; **Last 7 days**, the share of the due days of the last seven that were kept; and **Streak**, the longest current streak among the open habits, with that habit's title. A tile with nothing to count SHALL show a dash. The tiles SHALL be derived from the device's rows, offline too.

#### Scenario: A good week
- **WHEN** of 20 due days in the last seven 16 were kept, 2 of today's 4 habits are checked in, and Read runs 22 days
- **THEN** the tiles read "2 of 4", "80 %" and "22 days" with "Read"

### Requirement: A habit's page as a dashboard
While Habits is on, a habit's page SHALL show its numbers as tiles: the current streak, the best streak, the strength with a bar in the habit's colour, and the last 30 days as kept days of the due ones. It SHALL show the month, a **By weekday** chart and the year, side by side from 1024 px. The weekday chart SHALL show, per weekday from the first day of the week, the share of that weekday's due days kept in the last 12 weeks, and SHALL be readable as a list with one entry per weekday ("Monday, 9 of 12"). Everything SHALL be derived from the device's rows, offline too, and the page SHALL keep every control it had.

#### Scenario: The weak day
- **WHEN** the person opens Run, kept on most Mondays and Wednesdays and missed on most Fridays
- **THEN** the By weekday chart's Friday bar is the shortest and reads, for example, "Friday, 3 of 12"

#### Scenario: The numbers
- **WHEN** Read was kept 26 of its last 30 days and runs 22 days
- **THEN** the tiles read 22 days, the best streak, the strength and "26 of 30"
