# Spec Delta

## MODIFIED Requirements

### Requirement: Daily check
The app SHALL offer a Daily check at `/review/daily`, reachable from the Review screen's menu, the Loop home, the command palette and `g` then `Shift+R`. It SHALL show on one page:
- the open Inbox count with "Process the Inbox"
- the overdue tasks
- today's tasks, where `f` toggles a task in or out of today's focus, up to three tasks

"Done for today" SHALL write the time of the daily check on the user's `review` entity. Today's focus SHALL be written there as the local date and the chosen task ids. Both sync to the user's devices only, are written offline, converge by last-writer-wins, are not content, are included in the export, and derive no activity event. A focus whose date is not today SHALL be shown as empty. Completed or deleted tasks SHALL drop out of the focus as it is shown, without a write. "Today" and "the local date" here are the user's logical today (OpenSpec `date-time-preferences`, "Logical today"), so a check finished or a focus chosen after midnight but before the day start belongs to the day being lived.

#### Scenario: Pick a focus
- **WHEN** the user presses `f` on three of today's tasks and then on a fourth
- **THEN** the first three are the focus, the fourth is refused with a message that the focus holds three tasks, and the Loop home lists the three on every device after sync

#### Scenario: Next day
- **WHEN** the focus was chosen yesterday
- **THEN** today's Daily check and the Loop home show no focus until the user picks one

#### Scenario: Done for today
- **WHEN** the user finishes the Daily check on the phone
- **THEN** the laptop's Review marker no longer shows the daily check as due after sync

#### Scenario: Focus kept past midnight
- **WHEN** the day start is `04:00`, the focus was chosen on Wednesday evening and the user opens the Loop home at 01:00 on Thursday
- **THEN** the focus is still shown, and it is empty once 04:00 has passed

### Requirement: Rhythm markers
A rhythm SHALL be due as follows:
- the weekly review, when its last finish is more than seven days ago or never
- the Monthly look, when it is more than 30 days ago or never
- the Daily check, when it was not done on the user's logical today (OpenSpec `date-time-preferences`, "Logical today")

The sidebar Review entry SHALL carry the weekly marker in every mode. In `companion` and `first` modes it SHALL also carry the monthly marker. In `first` mode it SHALL also carry the daily marker. Each marker SHALL have a text alternative naming the rhythm. In `first` mode, the first time the app is opened on a logical day on which the Daily check is not done, a toast SHALL offer to start it, at most once per logical day per device.

#### Scenario: Lists only
- **WHEN** a user in `lists` mode has never done a Daily check or Monthly look and finished the weekly review yesterday
- **THEN** the Review entry carries no marker

#### Scenario: Open Loops first in the morning
- **WHEN** a user in `first` mode opens the app on a new day
- **THEN** a toast offers "Start your daily check", and dismissing it means it does not return on that device that day

#### Scenario: Daily check done in the evening, app open after midnight
- **WHEN** a user in `first` mode with a day start of `04:00` finished the Daily check on Wednesday evening and uses the app at 00:30 on Thursday
- **THEN** the Review entry carries no daily marker and no toast is shown until 04:00 has passed
