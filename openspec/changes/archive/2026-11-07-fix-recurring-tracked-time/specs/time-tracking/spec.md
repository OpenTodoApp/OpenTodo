## ADDED Requirements

### Requirement: Tracked time of a repeating task
For a repeating task the tracked total shown or read against its estimate SHALL count only the live entries that started since its current occurrence began: the latest completion or skip among the series' live occurrence records dated before its current due date, none counting before the first. An entry SHALL count whole for the occurrence it started in. This total SHALL be the one of the row chip, the task panel's Time tab and its tab label, the `tracked` filter terms, the automation condition `tracked` and the agent tools' `tracked_minutes`, the device and the server computing it identically, pinned by shared test vectors. The Time tab SHALL keep listing every entry of the task and, when earlier occurrences have entries, show "All occurrences" with the sum of every entry under the total. Statistics, the CSV export, Today's tracked total, the routine step Tracked time and `list_time_entries` SHALL keep counting every entry. Nothing SHALL be stored, moved or rewritten: the figure is computed from the entries and the occurrence records each device holds, works offline and follows synced completions, skips and undos.

#### Scenario: The next occurrence starts at zero
- **WHEN** a daily task estimated at 30 minutes has 40 minutes tracked, is completed, and 10 minutes are tracked on its next occurrence
- **THEN** its row chip reads `10m / 30m`, the Time tab reads "Total 10m" with "All occurrences 50m" under it and lists both entries, and `get_task` returns `tracked_minutes` 10

#### Scenario: A habit's skip starts a new occurrence
- **WHEN** a habit with 20 minutes tracked is skipped and nothing is tracked on the next occurrence
- **THEN** its row shows no tracked time and `tracked` does not match it

#### Scenario: Undo of a completion
- **WHEN** the user completes a repeating task with 40 minutes tracked and chooses Undo
- **THEN** the trashed occurrence record no longer counts and the row reads `40m / 30m` again

#### Scenario: A plain skip writes no record
- **WHEN** a repeating task that is not a habit is skipped
- **THEN** no occurrence starts there and its tracked time stays with the next occurrence

#### Scenario: Reports keep every entry
- **WHEN** the user exports the week's entries of a repeating task completed twice that week
- **THEN** the CSV lists every entry of both occurrences, and Statistics counts them on their days
