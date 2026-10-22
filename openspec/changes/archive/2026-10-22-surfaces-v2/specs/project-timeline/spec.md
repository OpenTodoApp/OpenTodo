# Spec Delta

## MODIFIED Requirements

### Requirement: Bars from start, due and deadline
A task's bar SHALL span from the earliest to the latest of its start date, due date (in the viewer's zone) and deadline; a single date is a one-day bar. A bar SHALL be drawn as a soft fill of the project's palette hue with a 3 px solid hue edge on its leading side and the strong text tone for its label, and the part of a bar before today SHALL be dimmed to the faint tone. The due day and the deadline SHALL be marked inside the bar when they are not its ends. A task with none of the three, or a `someday` start, SHALL be listed in an "Unscheduled" group at the end with no bar. A deadline in the past SHALL use the overdue tone for the bar's edge and its label, taking precedence over the hue.

#### Scenario: All three dates
- **WHEN** a task starts on the 3rd, is due on the 10th and has a deadline on the 14th
- **THEN** its bar runs from the 3rd to the 14th with a due marker on the 10th

#### Scenario: Due date only
- **WHEN** a task has only a due date
- **THEN** its bar covers that day

#### Scenario: Someday
- **WHEN** a task's start is `someday`
- **THEN** it is listed under "Unscheduled" without a bar, whatever its other dates

#### Scenario: Bar in the project hue
- **WHEN** the project is violet and a task's bar runs from the 12th to the 16th with today the 14th
- **THEN** the bar has the violet soft fill and edge, the 12th and 13th part is dimmed, and the 14th to the 16th is not

#### Scenario: Past deadline wins over the hue
- **WHEN** a violet project's task has a deadline of the 9th and today is the 14th
- **THEN** the bar's edge and label use the overdue tone instead of violet
