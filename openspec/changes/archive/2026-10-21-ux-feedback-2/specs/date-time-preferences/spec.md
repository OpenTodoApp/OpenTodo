## MODIFIED Requirements

### Requirement: Date and time entry follows the preferences
The due date, due time and reminder fields of task editing SHALL display their value in the user's formats, and SHALL accept typed input in the date format, ISO dates, and relative words (`today`, `tomorrow`, weekday names). Time fields SHALL accept 12-hour and 24-hour input in any time format. Unparseable input SHALL be rejected with a visible message and SHALL not change the task. The example dates a date field shows (its placeholder and the examples in its error message) SHALL be written in the user's date format.

#### Scenario: Typed day-month date
- **WHEN** the date format is `day-month` and the user types `3/11` into the due date field and confirms
- **THEN** the task is due on 3 November of the next year in which that date is not in the past

#### Scenario: Time typed in the other style
- **WHEN** the time format is `24h` and the user types `3pm` into the due time field
- **THEN** the due time becomes `15:00` and the field shows `15:00`

#### Scenario: Invalid input
- **WHEN** the user types `31/02` into a due date field and confirms
- **THEN** the field shows that the date is not valid and the task's due is unchanged

#### Scenario: Placeholder in the chosen order
- **WHEN** the date format is `month-day` and the user opens the When editor of a task without a date
- **THEN** the date field's placeholder and its error message for unparseable input show example dates in month-day order, never a fixed `22/10`

### Requirement: Time format
The time format SHALL apply to every user-facing time of day in the web app. `12h` SHALL show times like `3:00 PM`, `24h` like `15:00`, and `system` SHALL follow the interface language's locale (OpenSpec `localization`). This includes the due shown while scheduling (Process the Inbox, Focus) and its announcements, and a zone-fixed due time is shown in the viewer's zone there as everywhere. Stored values SHALL not change: a due time stays `HH:MM` and instants stay Unix milliseconds.

#### Scenario: 12-hour clock
- **WHEN** the time format is `12h` and a task is due at `15:00`
- **THEN** it is shown as `3:00 PM` and its stored due time is still `15:00`

#### Scenario: Timestamps follow the format
- **WHEN** the time format is `24h` and the user views a comment written at 3:05 PM
- **THEN** its timestamp shows `15:05`

#### Scenario: Day period in the interface language
- **WHEN** the interface language is Spanish, the time format is `12h` and a task is due at `15:00`
- **THEN** it is shown as `3:00 p. m.`

#### Scenario: Due time in Process the Inbox
- **WHEN** the time format is `12h` and Process the Inbox shows a task due at `15:00`
- **THEN** the card reads the due time as `3:00 PM`, as the task's row does
