## MODIFIED Requirements

### Requirement: Deadline countdown
A task with a deadline SHALL show, on its row in every list and in the detail panel, a countdown computed on the device from the deadline and the viewer's local calendar date: the days remaining (`3d`), `Today` on the deadline day, or the days elapsed (`2d over`). The chip SHALL use a neutral tone beyond seven days, a warning tone within seven days, and the danger tone on the day and after. The panel SHALL also show the full date. With the account's "Show deadlines as dates" setting on (off by default, synced, changed offline as an ordinary op), every task row SHALL show the deadline's date in the user's date format in the countdown's place, in the same tone, and its accessible name SHALL read "Deadline" and the full date.

#### Scenario: Countdown in a project list
- **WHEN** today is 2026-10-14 and a task in a project has the deadline `2026-10-17`
- **THEN** its row shows `3d` in the warning tone

#### Scenario: Past deadline
- **WHEN** today is 2026-10-14 and an open task has the deadline `2026-10-12`
- **THEN** its row shows `2d over` in the danger tone

#### Scenario: Countdown updates offline
- **WHEN** the device is offline and the viewer's calendar date advances past midnight
- **THEN** every countdown is recomputed from local data without a reload or a network request

#### Scenario: The date instead of the countdown
- **WHEN** today is 2026-10-14, a task has the deadline `2026-10-17`, and the user has turned on "Show deadlines as dates"
- **THEN** its row shows the date (`Oct 17` in an English date format) in the warning tone instead of `3d`, and the same choice applies on the user's other devices after sync
