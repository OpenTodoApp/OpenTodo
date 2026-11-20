# away-periods Specification

## Purpose
Away periods: one action that skips the occurrences of the user's repeating tasks over a range of days, also after the fact, keeps habit streaks, and pauses reminders and the email digest while the user is away; the same through the API and the CLI.

## Requirements

### Requirement: Set an away period
The user SHALL be able to set an away period from Today's menu and the command palette. The period SHALL have a start and an end day, inclusive, in the past, the present or the future, at most 90 days long, and SHALL cover either every repeating task the user may edit or only those in chosen projects or with chosen labels. Before anything is written the dialog SHALL show how many occurrences of how many repeating tasks it will skip. Setting it SHALL store the period in the user's preferences (`user_prefs.away`, one value holding the range and whether reminders are paused) and SHALL apply the skips of "Skipping inside the period" in the same batch, offered with one Undo. It SHALL work offline; the stored period converges by last-writer-wins as one value, so two devices never mix one period's start with another's end. One period SHALL be stored at a time; setting a new one replaces it.

#### Scenario: A week's holiday
- **WHEN** the user sets Away from 24 to 30 November covering everything, with a daily habit "Stretch" and a weekly "Take out the bins" on Thursdays
- **THEN** Stretch's occurrences of 24 to 30 November and the bins of the 27th are skipped in one batch, and Undo restores them

#### Scenario: Only some projects
- **WHEN** the user chooses Only and the project Work, while "Water the plants" repeats in the project Home
- **THEN** Work's repeating tasks are skipped in the range and "Water the plants" keeps its occurrences

#### Scenario: Offline
- **WHEN** the device is offline and the user sets an away period
- **THEN** the skips and the period apply at once on the device and reach the other devices on the next sync

### Requirement: Skipping inside the period
For each covered series with a calendar rule, every occurrence whose date is within the period, from the current occurrence on, SHALL be skipped exactly as "Skip this occurrence" skips it (OpenSpec `recurring-tasks`): the current occurrence moves the series to its next date that is not an exception, and each later one gets a skipped occurrence record with its derived id. A covered completion-relative series whose due date is within the period SHALL move to the day after the period; a habit also gets the skipped record of that date. A series the user may not edit SHALL NOT be covered. Tasks without a repeat rule SHALL keep their dates. Because the records are skipped, a habit's streak SHALL neither break nor grow over the period, and no skipped day SHALL count as done in Completed or Statistics. Applying the same period twice SHALL write no second record, because the ids are derived.

#### Scenario: After the fact
- **WHEN** on Friday the user says they were ill from Tuesday to Thursday, and a daily habit is overdue since Tuesday
- **THEN** Tuesday, Wednesday and Thursday become skipped records, the habit is due Friday, and its streak counts across the three days unbroken

#### Scenario: Completion-relative rule
- **WHEN** "Water the ferns" repeats every 3 days after completion, is due on 26 November, and the period runs from 24 to 30 November
- **THEN** it is due on 1 December

#### Scenario: Two devices
- **WHEN** two devices set the same away period offline and sync
- **THEN** each skipped occurrence has one record and the series has one due date

### Requirement: While away
While the user's logical today (OpenSpec `date-time-preferences`) is within the stored period, Today's title SHALL read "Away until <day>", and Today's menu SHALL offer **End now**, which clears the stored period and leaves the skips in place. When the period pauses reminders (the default), no reminder SHALL be delivered for the user by the server on any channel or by any device as a local notification, and no email digest SHALL be sent; reminders held this way SHALL be dropped, not delivered later. From the day after the period, reminders and the digest SHALL resume. A malformed stored value SHALL read as no period and SHALL be kept.

#### Scenario: Away until Friday
- **WHEN** today is Wednesday and the period ends on Friday
- **THEN** Today's title reads "Away until Friday"

#### Scenario: Quiet while away
- **WHEN** a non-repeating task has a reminder on Thursday inside a period that pauses reminders
- **THEN** no notification arrives on any device or channel, and the reminder is still listed on the task

#### Scenario: Ending early
- **WHEN** the user chooses End now on Wednesday
- **THEN** the period is cleared on every device after sync, reminders resume, and the occurrences already skipped stay skipped

### Requirement: Away through the API and CLI
`POST /api/v1/away` with `{from, to, projects?, labels?, pauseReminders?}` SHALL store the period and apply the skips of "Skipping inside the period" through the op log, as the app does, and answer the stored period and the number of skipped occurrences. `DELETE /api/v1/away` SHALL clear the period and answer 204. Both SHALL require a signed-in session or a token allowed to write tasks and SHALL refuse read and agent tokens. A malformed date, `from` after `to` or a range over 90 days SHALL answer 400 `invalid_input` naming the field; a project or label the caller cannot see SHALL answer 404. `ot away <from> <to>` and `ot away --end` SHALL do the same from the CLI.

#### Scenario: Anonymous request
- **WHEN** a request without credentials posts to `/api/v1/away`
- **THEN** the response is a 401 `unauthorized` error and nothing is written

#### Scenario: Read token refused
- **WHEN** a read token posts to `/api/v1/away`
- **THEN** the request is refused and nothing is written

#### Scenario: Invalid range
- **WHEN** the body has `from` 2026-11-30 and `to` 2026-11-24
- **THEN** the response is a 400 `invalid_input` error naming `from`

#### Scenario: From a script
- **WHEN** `ot away 2026-11-24 2026-11-30` runs with a full token
- **THEN** the period is stored, the covered occurrences are skipped, and every device shows "Away until" after sync
