# Spec Delta

## ADDED Requirements

### Requirement: Time commands
`ot time start <ref> [--note]` SHALL start an entry (stopping the running one), `ot time stop` SHALL stop it, and `ot time log <ref> <duration> [--on <date>] [--note]` or `ot time log <ref> --from <time> --to <time>` SHALL add a closed entry. They SHALL respect `--dry-run`, `--read-only` and token scope like every write command, and `--json` SHALL print the documented `time_entry` schema.

#### Scenario: Start then stop
- **WHEN** the user runs `ot time start 8c2a` and, 25 minutes later, `ot time stop`
- **THEN** the first prints the running entry's id and the task's title, the second prints the closed entry with `25m`, and both exit 0

#### Scenario: Log past work
- **WHEN** the user runs `ot time log 8c2a 1h30 --on yesterday --note "review"`
- **THEN** one closed entry of 90 minutes ending at 17:00 local time yesterday (the placement every duration-only entry on a past day gets) with the note "review" is created, and its id is printed

#### Scenario: Nothing running
- **WHEN** the user runs `ot time stop` with no running entry
- **THEN** the command exits with code 1 and prints the server's message that no entry is running

#### Scenario: Read token
- **WHEN** the stored token has scope `read` and the user runs `ot time start 8c2a`
- **THEN** no request is sent, the exit code is 5 and the error code is `insufficient_scope`, while `ot time list` and `ot time export` succeed

#### Scenario: Invalid duration
- **WHEN** the user runs `ot time log 8c2a soon`
- **THEN** the command exits with code 2 before any request, naming the accepted forms (`45m`, `1h30`, `90`)

### Requirement: Time listing and export commands
`ot time list [--task <ref>] [--from <date>] [--to <date>] [--running] [--limit n]` SHALL print entries with day, start, end, duration, task and project, newest first, and `ot time export [--from <date>] [--to <date>] [-o file]` SHALL download the server's CSV in the local time zone. Both are read commands that work with a `read` token; `--json` SHALL print an array of `time_entry` or the `export_file` schema.

#### Scenario: List this week
- **WHEN** the user runs `ot time list --from 2026-10-12 --to 2026-10-18`
- **THEN** the entries that started in those local days are printed newest first with an id prefix, day, `09:00–09:25`, `25m`, task title and project

#### Scenario: Running entry
- **WHEN** the user runs `ot time list --running` while an entry runs
- **THEN** exactly that entry is printed with an empty end and its elapsed minutes, and `--json` prints it with `endedAt: null`

#### Scenario: Export to a file
- **WHEN** the user runs `ot time export --from 2026-10-12 --to 2026-10-18 -o week.csv`
- **THEN** `week.csv` holds the server's CSV for that range in the local time zone and `--json` reports the file and row count

## MODIFIED Requirements

### Requirement: Natural-language line in `ot add`
`ot add --natural <line>` SHALL parse the line with the quick-add grammar (dates, times, ordinal weekdays, `#project`, `@label`, priority, estimate, time spent, recurrence, reminders) and create the task, its reminders and, for a `<spent>/<estimate>` token, one closed time entry from the result. Languages come from `--lang`, else the process locale, with English always active; numeric dates follow the first language and weeks start on Monday. For every line in the shared quick-add vectors the result SHALL equal the web parser's. Without `--natural` the title is taken verbatim.

#### Scenario: Line with a rule and a reminder
- **WHEN** the user runs `ot add --natural "Water plants every Monday remind me at 8 #home"` on Friday 2026-10-09 with a project named Home
- **THEN** the created task has title `Water plants`, project Home, due `2026-10-12`, rule `every monday`, and one relative reminder with offset −60 minutes, and the task id is printed

#### Scenario: German line
- **WHEN** the user runs `ot add --natural --lang de "Zahnarzt nächsten Mittwoch um 15 Uhr erinnere mich 30 Minuten vorher"`
- **THEN** the task is due next Wednesday at `15:00` with a relative reminder of −30 minutes and the title `Zahnarzt`

#### Scenario: Dry run shows every request
- **WHEN** the user runs `ot add --natural "Flight 3 Nov at 06:00 remind me 1 day before" --dry-run --json`
- **THEN** stdout lists a planned `POST /api/v1/tasks` and a planned `POST /api/v1/reminders` whose `task_id` is the planned task's placeholder, nothing is created, and the exit code is 0

#### Scenario: Unknown project token stays in the title
- **WHEN** the user runs `ot add --natural "Read #nosuch tomorrow"` and no project matches `nosuch`
- **THEN** the task is created in the Inbox with title `Read #nosuch`, due tomorrow, and no error

#### Scenario: Reminder request fails after the task was created
- **WHEN** the server accepts the task but answers the reminder request with an error
- **THEN** the command prints the server's message, names the created task id so the user can add the reminder by hand, and exits with code 1

#### Scenario: Read token
- **WHEN** the stored token has scope `read` and the user runs `ot add --natural "Call mum remind me at 9"`
- **THEN** no request is sent, the exit code is 5 and the error code is `insufficient_scope`

#### Scenario: Spent and estimate from the line
- **WHEN** the user runs `ot add --natural "Draft the offer 30m/2h" --dry-run --json`
- **THEN** stdout lists a planned `POST /api/v1/tasks` with `estimate_minutes: 120` and a planned `POST /api/v1/time-entries` with the task's placeholder, a `startedAt` 30 minutes before `endedAt`, and nothing is created

#### Scenario: Ordinal weekday line
- **WHEN** the user runs `ot add --natural "Board every 2nd Tuesday of the month at 10:00"` on Saturday 2026-10-10
- **THEN** the created task has title `Board`, rule `every 2nd tuesday`, due `{date: "2026-10-13", time: "10:00"}`, and the task id is printed

