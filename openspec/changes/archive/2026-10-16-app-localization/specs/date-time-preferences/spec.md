# Spec Delta

## MODIFIED Requirements

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
