# Spec Delta

## MODIFIED Requirements

### Requirement: Date and time preferences
Each user SHALL have four preferences:
- date format: `system`, `day-month`, `month-day` or `iso`
- time format: `system`, `12h` or `24h`
- first day of the week: `system`, `mon`, `sun` or `sat`
- day start: a time of day `HH:MM` from `00:00` to `06:00`, after which a new day begins for that person

The first three SHALL default to `system`, which follows the locale of the interface language (OpenSpec `localization`; the browser locale while the language is `system`) and its week information where available, else Monday. The day start SHALL default to `00:00`, the calendar midnight, which keeps today's behaviour. A client SHALL treat an unknown or missing value as `system`, and a missing, malformed or out-of-range day start as `00:00`, in every case keeping the stored value unchanged.

#### Scenario: New account
- **WHEN** a user who never opened the preferences views a task due on 2026-10-14 at 15:00
- **THEN** it is shown exactly as the browser locale formats it, as before this change

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives a date format value it does not know
- **THEN** it formats dates as `system` and keeps the stored value unchanged

#### Scenario: System follows the chosen language
- **WHEN** the browser locale is `en-US`, the interface language is German and the three preferences are `system`
- **THEN** a task due on 2026-10-14 at 15:00 is shown as `14.10.2026`, `15:00`, and weeks start on Monday

#### Scenario: Browser region is kept
- **WHEN** the browser prefers `de-CH` and the interface language is German
- **THEN** `system` formats follow `de-CH`

#### Scenario: Day start out of range
- **WHEN** a device receives a day start of `09:00`, `4am` or an empty string
- **THEN** it behaves as if the day started at `00:00` and keeps the stored value unchanged

#### Scenario: Day start with minutes from a newer client
- **WHEN** a device receives a day start of `03:30`
- **THEN** it treats 03:29 as the previous day and 03:30 as the new day, even though its own Settings offer whole hours only

### Requirement: Preferences in Settings
Settings SHALL offer a Date and time panel with the four preferences and a live preview of a sample date, time and week. The day start SHALL be offered as the whole hours from `00:00` (named as midnight) to `06:00`, each shown in the user's time format, with one line explaining that work done before that time counts for the previous day; the preview SHALL name the day the device currently considers today. A change SHALL apply at once, without a reload.

#### Scenario: Live preview
- **WHEN** the user switches the time format from `24h` to `12h` in Settings
- **THEN** the preview shows `3:00 PM` and open views show 12-hour times without a reload

#### Scenario: Pick a day start at night
- **WHEN** it is 01:30 on Thursday 15 October and the user sets the day start to `04:00`
- **THEN** the preview says today is Wednesday 14 October, the Today view behind the panel lists Wednesday's tasks without a reload, and the setting reaches the user's other devices on the next sync

#### Scenario: Keyboard
- **WHEN** the user tabs to the day start control and chooses a value with the arrow keys
- **THEN** the value is written and the preview updates, with no mouse

## ADDED Requirements

### Requirement: Logical today
The web app SHALL compute one logical today per device: the local calendar date, or the previous date while the local time is before the day start. Every screen and rule that asks which day it is SHALL use it and SHALL move to the next day within a minute of the day start while the app stays open. The preference is applied when reading: stored dates and instants never change, nothing new is written, and devices converge as before.

#### Scenario: Night owl at half past one
- **WHEN** the day start is `04:00`, the local time is 01:30 on Thursday 15 October, and a task is due on Wednesday 14 October
- **THEN** the task is listed under Today, not Overdue, Upcoming begins with Thursday as "Tomorrow", and the sidebar's Today count includes it

#### Scenario: Rollover at the day start
- **WHEN** the day start is `04:00` and the app shows Today at 03:59
- **THEN** within a minute after 04:00, Wednesday's open tasks move to Overdue and Thursday's are listed under Today, without a reload or a data change

#### Scenario: Completion counted for the day being lived
- **WHEN** the day start is `04:00` and the user completes a task at 01:30 on Thursday 15 October
- **THEN** the task's `completed_at` is the real instant, and the Completed logbook, Statistics and the Loop pulse count it for Wednesday 14 October

#### Scenario: Midnight default is unchanged
- **WHEN** the day start is `00:00` or the row has none
- **THEN** every screen behaves exactly as before this change

#### Scenario: Two devices, different clocks
- **WHEN** a laptop with the day start applied and a phone that has not yet synced the preference both show the same tasks
- **THEN** they may name different days as today until the phone syncs, but neither writes anything because of it, and after sync both show the same lists from the same rows

#### Scenario: Offline
- **WHEN** the device is offline at 02:00 with a day start of `03:00`
- **THEN** Today, Statistics and the habit streaks use yesterday as today from local data, and the stored preference is read from the local copy of the row

### Requirement: Logical day of an instant
The day an instant belongs to (a completion, a creation, a finished Daily check) SHALL be decided the same way as the logical today: its local calendar date, or the previous date when its local time is before the day start. Lists, groupings and counts SHALL use this day; the instant itself is stored unchanged.

#### Scenario: Completion before the day start
- **WHEN** the day start is `04:00` and a task has `completed_at` at 01:30 on Thursday 15 October
- **THEN** its logical day is Wednesday 14 October everywhere the day is shown or counted

#### Scenario: Completion after the day start
- **WHEN** the day start is `04:00` and a task has `completed_at` at 04:00 on Thursday 15 October
- **THEN** its logical day is Thursday 15 October
