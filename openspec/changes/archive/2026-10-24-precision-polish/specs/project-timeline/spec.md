## MODIFIED Requirements

### Requirement: Bars from start, due and deadline
A task's bar SHALL span from the earliest to the latest of its start date, due date (in the viewer's zone) and deadline; a single date is a one-day bar. A bar SHALL be drawn as a soft fill of the project's palette hue with a 3 px solid hue edge on its leading side, and the part of a bar before today SHALL be dimmed to the faint tone. A bar at least 96 px wide SHALL show the task's title inside it in the strong text tone; a shorter bar SHALL be followed by its length in days. The due day SHALL be marked inside the bar when it is not one of its ends, and the deadline SHALL be marked by a diamond at its day in the warning tone, followed by "Deadline" and its date when the bar has no other label after it. A task with none of the three, or a `someday` start, SHALL be listed in an "Unscheduled" group at the end with no bar. A task SHALL be late when its deadline or its due day lies before today; a late bar SHALL use the overdue tone for its fill, edge and diamond, taking precedence over the hue, and SHALL be followed by "n days late", counted from the deadline when it has passed and from the due day otherwise. The note after a bar (its length, "n days late" or the deadline) SHALL start just after the bar unless it would cross the today line, in which case it SHALL start just past the line; and when it would run past the end of the axis it SHALL end just before the bar instead, so a note never covers the today line or leaves the axis.

#### Scenario: All three dates
- **WHEN** a task starts on the 3rd, is due on the 10th and has a deadline on the 14th
- **THEN** its bar runs from the 3rd to the 14th with a due marker on the 10th and a deadline diamond on the 14th

#### Scenario: Due date only
- **WHEN** a task has only a due date
- **THEN** its bar covers that day and is followed by "1 day"

#### Scenario: Someday
- **WHEN** a task's start is `someday`
- **THEN** it is listed under "Unscheduled" without a bar, whatever its other dates

#### Scenario: Bar in the project hue
- **WHEN** the project is violet and a task's bar runs from the 12th to the 16th with today the 14th
- **THEN** the bar has the violet soft fill and edge, the 12th and 13th part is dimmed, and the 14th to the 16th is not

#### Scenario: Title inside a long bar
- **WHEN** a task "Remove the old splashback" has a bar of 7 days on the day axis
- **THEN** the title is written inside the bar, truncated to fit

#### Scenario: Past deadline wins over the hue
- **WHEN** a violet project's task has a deadline of the 9th and today is the 14th
- **THEN** the bar's fill, edge and diamond use the overdue tone instead of violet, and the bar is followed by "5 days late"

#### Scenario: Overdue due day
- **WHEN** a task with no deadline was due on the 12th and today is the 14th
- **THEN** its bar uses the overdue tone and is followed by "2 days late"

#### Scenario: A past start is not late
- **WHEN** a task's only date is a start on the 10th and today is the 14th
- **THEN** its bar is dimmed and not drawn as late

#### Scenario: Late note clear of the today line
- **WHEN** a task was due yesterday on the day axis, so "1 day late" after its bar would cross the today line
- **THEN** the note starts just past the today line

#### Scenario: Note at the end of the axis
- **WHEN** a one-day bar sits on the axis's last day
- **THEN** its "1 day" note is drawn before the bar, ending just before it
