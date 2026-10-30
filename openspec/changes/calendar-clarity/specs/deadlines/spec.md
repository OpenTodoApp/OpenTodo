## ADDED Requirements

### Requirement: Deadlines on the calendar
An open, not deleted task of a non-archived project SHALL show its deadline on the deadline's date in the calendar: as a chip with the deadline diamond in the warning tone in the all-day strip of Day and Week (before event chips, sharing the strip's three-chip limit and "+N"), as a row with the diamond at the end of a Month cell (taking part in "+N more"), and after the tasks of the Plan's column. When the task itself is shown on that date as a block, lane row or Month row, the diamond SHALL sit on it instead of a separate marker. Markers SHALL never count toward capacity, never be dragged or accept drops, be dimmed on days before today, follow an active calendar filter, and open the task when activated with the pointer or the keyboard. Their accessible name SHALL include "Deadline". They SHALL be computed on the device from local data, work offline, and follow synced deadline changes without a reload.

#### Scenario: Due Thursday, deadline Friday
- **WHEN** a task is due Thursday at 10:00 and has a deadline on Friday
- **THEN** the Week shows its block on Thursday and a "Deadline" chip with the diamond in Friday's all-day strip, and Friday's capacity is unchanged

#### Scenario: Due on its deadline
- **WHEN** a task is due Friday without a time and its deadline is Friday
- **THEN** Friday's lane row carries the diamond and no separate chip is added

#### Scenario: Month cell
- **WHEN** the 20th holds two task rows and one deadline of a task due on the 18th
- **THEN** the cell lists the two tasks, then the deadline row with its diamond

#### Scenario: Open from the keyboard
- **WHEN** the user tabs to a deadline chip and presses Enter
- **THEN** the task opens as it would from a list

#### Scenario: Deadline moved elsewhere
- **WHEN** another device moves the deadline from Friday to Monday and this device syncs
- **THEN** the chip leaves Friday and appears on Monday without a reload

#### Scenario: Completed task
- **WHEN** the task is completed
- **THEN** its deadline marker disappears from the calendar
