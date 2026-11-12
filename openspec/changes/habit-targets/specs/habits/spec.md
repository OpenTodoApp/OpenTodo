## ADDED Requirements

### Requirement: Target habits
A task SHALL have the additive fields `habit_target` (a whole number, 0 for none, at most 31) and `habit_period` (`""`, `week` or `month`), converging by last-writer-wins and editable offline. A habit with a target and a period SHALL have the rule `every day`; it SHALL be offered (in the Today strip and as pending on the Habits screen) on every day of a period until the period holds `habit_target` done records (tiny included), and then rest until the next period begins. A period SHALL begin on the user's first day of the week, or on the first of the month, in their logical today. Days of a target habit SHALL never read as missed. Kept SHALL read "N of T this week" (or "this month"); a period is **met** when it holds at least the target. Strength SHALL be computed over periods with each period adding the share of the target it holds, at most one; the current and best streaks SHALL count consecutive met periods, the current period not counted until met or over. **At risk** SHALL be true when the days left in the current period are fewer than the done records it still needs, or when the two latest periods were both not met. Skipping SHALL not be offered for a target habit.

#### Scenario: Gym three times a week
- **WHEN** Gym has a target of 3 per week, the week starts on Monday, and the user checked in on Monday and Thursday
- **THEN** on Friday Gym is offered and reads "2 of 3 this week", Tuesday and Wednesday read as rest days, not missed

#### Scenario: Target met
- **WHEN** the user checks in Gym on Friday
- **THEN** Gym reads "3 of 3 this week", leaves the Today strip until Monday, and the week counts toward the streak once it is over

#### Scenario: Can't make it any more
- **WHEN** it is Sunday and Gym holds one check-in this week
- **THEN** Gym is at risk, shown without a danger colour

#### Scenario: Same week on two devices
- **WHEN** two offline devices each check in Gym on a different day and both sync
- **THEN** every device reads "2 of 3 this week"

### Requirement: Amount habits
A task SHALL have the additive fields `habit_amount` (a positive number, 0 for none), `habit_unit` (text, user-written content) and `habit_step` (a positive number, 1 by default), converging by last-writer-wins and editable offline. For an amount habit, the check button SHALL add `habit_step` to the day's amount and show "N of A unit"; a day whose amount reaches `habit_amount` SHALL be done and complete the occurrence as a check-in does, a day with a positive amount below it SHALL be a **partial** day that counts as tiny for kept, strength and streaks and shows the share filled, and a day with none SHALL follow the habit's schedule as before. A menu on the button SHALL subtract a step or set an exact amount. The day's amount SHALL be the sum of the tallies of every device (see "Exact amounts across devices"). Amounts SHALL be editable on past days like any state.

#### Scenario: Eight glasses
- **WHEN** Water has an amount of 8 glasses and the user presses its check button five times today
- **THEN** it reads "5 of 8 glasses", today shows five eighths filled and counts as kept, and Completed does not list it yet

#### Scenario: Reaching the amount
- **WHEN** the user presses it three more times
- **THEN** it reads "8 of 8 glasses", today is done, and the occurrence is completed as any check-in

#### Scenario: Fixing a mistake
- **WHEN** the user chooses Subtract on "8 of 8 glasses"
- **THEN** it reads "7 of 8 glasses", today is partial again, and the completion is undone

### Requirement: Exact amounts across devices
Each device SHALL record its additions to a day as a `habit_tally` row with a name-based id derived from the occurrence record and the device id, holding its own count, so that devices never write each other's rows; the day's amount SHALL be the sum of the day's live tallies. A tally SHALL follow its habit's sharing, export, trash and end-to-end encryption rules (the count is not content). Setting an exact amount on a device SHALL set its own tally to the exact amount minus the other devices' counts, never below zero. The server, the API and MCP SHALL report the sum.

#### Scenario: Two phones, offline
- **WHEN** phone A adds two glasses and phone B adds three glasses to today's Water, both offline, and both sync
- **THEN** every device and the server read "5 of 8 glasses"

#### Scenario: Export
- **WHEN** the user downloads the JSON export
- **THEN** each day's tallies are present with their record id, device and count

### Requirement: Targets and amounts in tools and routes
`list_habits`, `get_habit`, `GET /api/v1/habits` and `GET /api/v1/habits/{id}` SHALL carry `target`, `period`, `amount`, `unit` and, per day, the day's amount; `log_habit` and `POST /api/v1/habits/{id}/log` SHALL accept `amount` (added as the calling client's own tally, or `set_amount` for an exact value) for an amount habit and answer 400 `invalid_input` naming `amount` for a habit without one or a negative value. The server's numbers SHALL include periods and partial days with the same vectors as the devices. `create_tasks`, `update_tasks` and the New habit form SHALL accept a target with its period, and an amount with its unit and step.

#### Scenario: Log water from a shortcut
- **WHEN** a shortcut posts `{"amount": 1}` to Water's log route twice
- **THEN** today reads "2 of 8 glasses" on the server and on every device after sync

#### Scenario: Amount on a plain habit
- **WHEN** a client posts `{"amount": 1}` to the log route of Read, which has no amount
- **THEN** it answers 400 `invalid_input` naming `amount`, and nothing is written

#### Scenario: Not signed in
- **WHEN** the log route is called with an amount and no credentials
- **THEN** it answers 401 and nothing is written

### Requirement: Targets and amounts on screen
The New habit form's How often SHALL offer "Times per week" and "Times per month" with the number, and an **Amount** choice with the number, the unit and the step. The thread of a target habit SHALL show the current week (or month) as one bar divided into the target's parts, filled for done check-ins, and earlier periods as met or not met; the thread of an amount habit SHALL fill each day by its share. Both SHALL use the visual language of "Habit visual language", differ by shape as well as colour, and announce their state ("This week, 2 of 3", "Today, 5 of 8 glasses").

#### Scenario: Read a target bar
- **WHEN** a screen reader user reaches Gym's thread after two check-ins this week
- **THEN** it is announced as "This week, 2 of 3", and the bar shows two of three parts filled
