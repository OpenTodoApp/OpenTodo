# Spec Delta

## MODIFIED Requirements

### Requirement: Overlap and capacity
Blocks that overlap in time SHALL be laid out side by side without hiding each other and SHALL carry an overlap marker. Each day column SHALL show the sum of estimates of its open timed and untimed tasks against a configurable day length (default 8 hours) and SHALL mark the day when the sum exceeds it. Blocks of subscribed calendar events (OpenSpec `calendar-feeds`) SHALL take part in the side-by-side layout and the marker, and SHALL NOT count toward the sum.

#### Scenario: Two tasks at the same time
- **WHEN** two tasks are due today at 10:00
- **THEN** both blocks are visible side by side with the overlap marker

#### Scenario: Over capacity
- **WHEN** today's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the day header shows `9h / 8h` marked as over capacity

#### Scenario: Task during a meeting
- **WHEN** a subscribed calendar has a meeting 10:00 to 11:00 and a 30-minute task is due today at 10:00
- **THEN** the task block and the event block are drawn side by side with the overlap marker, and the day header counts only the task's 30 minutes

#### Scenario: Calendars hidden
- **WHEN** the user hides calendars on this device
- **THEN** task blocks are laid out as if no events existed and the header is unchanged
