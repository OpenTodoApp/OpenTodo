## MODIFIED Requirements

### Requirement: Today display
The Today display SHALL show a clock in the user's time format and the date in the user's date format, the tasks due before today first under "Earlier" and today's tasks under them, the tasks completed today ticked below, and the next days (`days` 1–7, default 3) each as its own column with the day's heading. Group labels SHALL follow the list group header style (uppercase, muted) scaled with the display's type. Columns SHALL stack on screens narrower than 768 px. Dates and the clock SHALL roll over by themselves at midnight without a reload.

#### Scenario: Morning view
- **WHEN** it is 07:30 on Wednesday and the display opens with the default days
- **THEN** it shows the clock, "Wednesday 14 October" in the user's format, Earlier and Today groups, and columns for Thursday, Friday and Saturday

#### Scenario: Midnight
- **WHEN** the display stays open past midnight
- **THEN** yesterday's remaining tasks move into Earlier, the date changes, and the columns shift by one day, without a reload

#### Scenario: Completed today
- **WHEN** a member completes a task due today on their phone
- **THEN** the display shows it ticked under today's open tasks within a few seconds
