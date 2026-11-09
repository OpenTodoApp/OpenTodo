# Spec Delta

## ADDED Requirements

### Requirement: Time block
A `show_time` block (a date range of at most 31 days, grouped by `project` or `day`) SHALL show the user's tracked time in that range as bars with each group's total and the overall total, read from this device's time entries. Activating a group SHALL open it in Statistics. It works offline from local entries and changes nothing.

#### Scenario: A week by project
- **WHEN** the model shows this week's time grouped by project, and the user tracked 6 h on Website and 2 h on Home
- **THEN** the block shows two bars, 6 h and 2 h, and a total of 8 h

### Requirement: Free time block
A `show_free_time` block (a day or a week, and a minimum length) SHALL show the free slots of each day within the working day, between calendar events, frames and timed tasks, as the calendar counts them. It is read-only; placing a task in a slot is a proposal.

#### Scenario: Two free hours
- **WHEN** the model shows Thursday's free time of at least 120 minutes, and Thursday has meetings 9 to 11 and 13 to 15 in an 8 to 18 working day
- **THEN** the block shows 15:00 to 18:00 as free and nothing shorter than two hours

### Requirement: Deadlines block
A `show_deadlines` block (a date range) SHALL show the open tasks with a deadline in that range in date order, each with its countdown as the app writes it, as rows that open the task.

#### Scenario: Before Friday
- **WHEN** the model shows deadlines until Friday and two open tasks have deadlines Wednesday and Friday
- **THEN** the block lists both in date order with their countdowns
