## MODIFIED Requirements

### Requirement: Daily check
The app SHALL offer a Daily check at `/review/daily`, reachable from the Review screen's menu, the Loop home, the command palette and `g` then `Shift+R`. It SHALL show on one page:
- Today's briefing (web-app "Day page briefing"), shown first
- yesterday's line for tomorrow, when the last Close the day closed an earlier logical day than today and left a note, shown next and read-only
- the open Inbox count with "Process the Inbox"
- the overdue tasks
- today's tasks, where `f` toggles a task in or out of today's focus, up to three tasks

"Done for today" SHALL write the time of the daily check on the user's `review` entity. Today's focus SHALL be written there as the local date and the chosen task ids. Both sync to the user's devices only, are written offline, converge by last-writer-wins, are not content, are included in the export, and derive no activity event. A focus whose date is not today SHALL be shown as empty. Completed or deleted tasks SHALL drop out of the focus as it is shown, without a write. "Today" and "the local date" here are the user's logical today (OpenSpec `date-time-preferences`, "Logical today"), so a check finished or a focus chosen after midnight but before the day start belongs to the day being lived. The day a close closed is the day stored with it (`closed_day`), or, for a close stored without one, the logical day of its time. The note needs no write to show or to stop showing: it is shown while the latest close closed an earlier day and disappears once the day is closed again.

#### Scenario: Pick a focus
- **WHEN** the user presses `f` on three of today's tasks and then on a fourth
- **THEN** the first three are the focus, the fourth is refused with a message that the focus holds three tasks, and the Loop home lists the three on every device after sync

#### Scenario: Next day
- **WHEN** the focus was chosen yesterday
- **THEN** today's Daily check and the Loop home show no focus until the user picks one

#### Scenario: Done for today
- **WHEN** the user finishes the Daily check on the phone
- **THEN** the laptop's Review marker no longer shows the daily check as due after sync

#### Scenario: Yesterday's note in the morning
- **WHEN** the day was closed yesterday with "Start with the invoice" and the user opens the Daily check today
- **THEN** the note is shown under Today's briefing and above the Inbox count as yesterday's line, and it is gone once today is closed

#### Scenario: No note
- **WHEN** the day was closed yesterday without a note, or never
- **THEN** the Daily check shows no note line and nothing else changes

#### Scenario: Focus kept past midnight
- **WHEN** the day start is `04:00`, the focus was chosen on Wednesday evening and the user opens the Loop home at 01:00 on Thursday
- **THEN** the focus is still shown, and it is empty once 04:00 has passed

#### Scenario: Closed just after midnight
- **WHEN** the day start is `00:00`, the user opened Close the day at 23:59 on Wednesday, wrote "Start with the invoice" and closed at 00:02 on Thursday
- **THEN** Thursday's Daily check shows "Start with the invoice" as yesterday's line

#### Scenario: The check opens with Today's briefing
- **WHEN** one task is two days late and the user opens the Daily check
- **THEN** the page starts with the same sentence as Today, "One thing matters today." followed by the late task, and it changes as Today's does
