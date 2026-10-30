## MODIFIED Requirements

### Requirement: Column contents
Each column SHALL list the open tasks due that day in the viewer's zone with the same selection as Day, Week and Month (deleted and archived-project tasks left out, completed tasks included only when the Calendar's Show completed choice is on), timed tasks first in time order, then the others by priority and position. Each row SHALL show its time when it has one, its title, its estimate and its priority. Completed titles SHALL be struck through and announce their completed status, in both the columns and the phone agenda; completed rows SHALL be selectable and openable but SHALL NOT be rescheduled or completed again from the calendar. Columns SHALL NOT be manually ordered. The selection SHALL work offline; identical task rows and the same visibility choice SHALL produce identical columns after sync.

#### Scenario: Zoned due on the viewer's day
- **WHEN** a task is due `02:00 Asia/Tokyo` on the 12th and the user views the Plan from Berlin
- **THEN** the task appears in the column of the 11th with its Berlin time

#### Scenario: Order within a column
- **WHEN** a day holds a task at 14:00, a task at 09:00, a priority 1 task without a time and a priority 4 task without a time
- **THEN** the column lists 09:00, 14:00, the priority 1 task, then the priority 4 task

#### Scenario: Not reordered by hand
- **WHEN** the user tries to drag a row above another in the same column or presses Alt+Up on it
- **THEN** nothing moves and no operation is queued

### Requirement: Capacity bar per day
Each column header SHALL show a capacity bar and the planned total against the device's day length, summing three sources: the estimates of the day's open tasks, the minutes of the day's busy subscribed calendar events, and the estimates of projected occurrences of recurring tasks. Tasks and projections without an estimate SHALL count as zero and be reported. The bar SHALL mark the day when the sum exceeds the day length. This calculation SHALL run on local data offline and SHALL reflect converged task rows after sync.

#### Scenario: Three sources on one day
- **WHEN** a day has open tasks estimated at 2 h 50, a 10:00 to 11:30 meeting from a subscribed calendar, a projected weekly task estimated at 45 minutes and five unestimated tasks, with an 8-hour day length
- **THEN** the header reads `5h 5m / 8h` and its tooltip reads "2h 50m of tasks, 1h 30m in calendar events, 45m repeating · 5 tasks without estimate"

#### Scenario: Over capacity
- **WHEN** a day's three sources total 9 hours with an 8-hour day length
- **THEN** the header shows `9h / 8h` marked as over capacity, and the mark is announced to assistive technology

#### Scenario: Completing a task
- **WHEN** a task listed in a column is completed
- **THEN** the day's total decreases by its estimate; its row leaves the column when Show completed is off, or stays with a struck-through title when it is on

#### Scenario: Completed work does not add future work
- **WHEN** Show completed is on and the span contains a completed recurring occurrence
- **THEN** its stored row is visible, but contributes neither estimated nor unestimated remaining work and does not produce recurring projections
