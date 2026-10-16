# date-time-preferences Specification

## Purpose

Lets each user choose how dates and times look and how weeks start (date format, time format, first day of the week) once, and has every date and time the web app shows or accepts follow that choice on all of the user's devices.

## Requirements

### Requirement: Date and time preferences
Each user SHALL have three preferences:
- date format: `system`, `day-month`, `month-day` or `iso`
- time format: `system`, `12h` or `24h`
- first day of the week: `system`, `mon`, `sun` or `sat`

Each SHALL default to `system`, which follows the locale of the interface language (OpenSpec `localization`; the browser locale while the language is `system`) and its week information where available, else Monday. A client SHALL treat an unknown or missing value as `system`.

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

### Requirement: Preferences are personal, synced and offline
The preferences SHALL be written as operations on the user's personal data, so that they apply on every device of that user and never on another user's. They SHALL be editable offline and take effect at once on the editing device. Concurrent edits SHALL converge per preference by last-writer-wins.

#### Scenario: Change on one device
- **WHEN** the user sets the time format to `24h` on a laptop and a phone later syncs
- **THEN** both devices show times on a 24-hour clock

#### Scenario: Change offline
- **WHEN** the device is offline and the user sets the date format to `iso`
- **THEN** dates on that device are shown as `2026-10-14` immediately, and the change reaches the other devices on the next sync

#### Scenario: Concurrent edits
- **WHEN** device A sets the date format to `day-month` and device B sets it to `month-day`, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp

#### Scenario: Included in the export
- **WHEN** a user with the date format `iso` downloads their JSON export
- **THEN** the export contains their date, time and week preferences, and importing it into a new account restores them

#### Scenario: Not shared with project members
- **WHEN** a user who shares a project with someone changes their preferences
- **THEN** the other member's devices keep their own formats

### Requirement: Date format
The date format SHALL apply to every user-facing date in the web app. With `day-month`, compact dates SHALL read like `14 Oct` and numeric dates like `14/10/2026`. With `month-day`, they SHALL read like `Oct 14` and `10/14/2026`. With `iso`, they SHALL read like `2026-10-14`. A year SHALL be added to a compact date outside the current year. Month and weekday names SHALL come from the interface language's locale (OpenSpec `localization`).

#### Scenario: Day-month in a list
- **WHEN** the date format is `day-month` and a task is due on 2026-11-03, more than a week ahead
- **THEN** its row shows `3 Nov`

#### Scenario: Other year
- **WHEN** the date format is `month-day` and a task is due on 2027-02-03
- **THEN** its row shows `Feb 3, 2027`

#### Scenario: Relative words are kept
- **WHEN** a task is due today or tomorrow
- **THEN** the row still shows `Today` or `Tomorrow`, whatever the date format

#### Scenario: Names in the interface language
- **WHEN** the interface language is French, the date format is `day-month` and a task is due on 2026-11-03
- **THEN** its row shows `3 nov.` and a date heading reads `mardi 3 nov.`

### Requirement: Time format
The time format SHALL apply to every user-facing time of day in the web app. `12h` SHALL show times like `3:00 PM`, `24h` like `15:00`, and `system` SHALL follow the interface language's locale (OpenSpec `localization`). Stored values SHALL not change: a due time stays `HH:MM` and instants stay Unix milliseconds.

#### Scenario: 12-hour clock
- **WHEN** the time format is `12h` and a task is due at `15:00`
- **THEN** it is shown as `3:00 PM` and its stored due time is still `15:00`

#### Scenario: Timestamps follow the format
- **WHEN** the time format is `24h` and the user views a comment written at 3:05 PM
- **THEN** its timestamp shows `15:05`

#### Scenario: Day period in the interface language
- **WHEN** the interface language is Spanish, the time format is `12h` and a task is due at `15:00`
- **THEN** it is shown as `3:00 p. m.`

### Requirement: First day of the week
The first day of the week SHALL decide where weeks start in every week-shaped display of the web app: the Week view and the calendar of a date field.

#### Scenario: Sunday start in the date picker
- **WHEN** the first day of the week is `sun` and the user opens a date field's calendar
- **THEN** each week row starts on Sunday

### Requirement: Date and time entry follows the preferences
The due date, due time and reminder fields of task editing SHALL display their value in the user's formats, and SHALL accept typed input in the date format, ISO dates, and relative words (`today`, `tomorrow`, weekday names). Time fields SHALL accept 12-hour and 24-hour input in any time format. Unparseable input SHALL be rejected with a visible message and SHALL not change the task.

#### Scenario: Typed day-month date
- **WHEN** the date format is `day-month` and the user types `3/11` into the due date field and confirms
- **THEN** the task is due on 3 November of the next year in which that date is not in the past

#### Scenario: Time typed in the other style
- **WHEN** the time format is `24h` and the user types `3pm` into the due time field
- **THEN** the due time becomes `15:00` and the field shows `15:00`

#### Scenario: Invalid input
- **WHEN** the user types `31/02` into a due date field and confirms
- **THEN** the field shows that the date is not valid and the task's due is unchanged

### Requirement: Date fields have a keyboard-operable calendar
Every date field in task editing SHALL offer a calendar to pick a date. Its weeks SHALL start on the preferred first day, today and the selected date SHALL be marked, and it SHALL be fully operable by keyboard: arrows move by day and week, Page Up and Page Down by month, Enter picks and Escape closes.

#### Scenario: Pick by keyboard
- **WHEN** the due date field's calendar is open on 14 October and the user presses the right arrow twice and Enter
- **THEN** the task is due on 16 October and the calendar closes

### Requirement: Preferences in Settings
Settings SHALL offer a Date and time panel with the three preferences and a live preview of a sample date, time and week. A change SHALL apply at once, without a reload.

#### Scenario: Live preview
- **WHEN** the user switches the time format from `24h` to `12h` in Settings
- **THEN** the preview shows `3:00 PM` and open views show 12-hour times without a reload
