## MODIFIED Requirements

### Requirement: Tracked time of a repeating task
For a repeating task the tracked total shown in the app against its estimate SHALL count only the live entries that started since its current occurrence began: the latest completion or skip among the series' live occurrence records dated before its current due date, none counting before the first. An entry SHALL count whole for the occurrence it started in. This total SHALL be the one of the row chip, the task panel's Time tab and its tab label, the filter terms `tracked occurrence` and `tracked occurrence cmp duration`, and the agent tools' `tracked_minutes_occurrence`, the device and the server computing it identically, pinned by shared test vectors. The Time tab SHALL keep listing every entry of the task and, when earlier occurrences have entries, show "All occurrences" with the sum of every entry under the total. What 1.0 clients and stored programs read SHALL keep counting every entry of the task, as in v1.0.0: the agent tools' `tracked_minutes`, the automation condition `tracked`, the filter terms `tracked` and `tracked cmp duration` (saved views, sidebar counts, routine Find tasks steps), and also statistics, the CSV export, Today's tracked total, the routine step Tracked time and `list_time_entries`. `tracked_minutes_occurrence` SHALL be present on a repeating task only. Nothing SHALL be stored, moved or rewritten: both figures are computed from the entries and the occurrence records each device holds, work offline and follow synced completions, skips and undos.

#### Scenario: The next occurrence starts at zero
- **WHEN** a daily task estimated at 30 minutes has 40 minutes tracked, is completed, and 10 minutes are tracked on its next occurrence
- **THEN** its row chip reads `10m / 30m`, the Time tab reads "Total 10m" with "All occurrences 50m" under it and lists both entries, and `get_task` returns `tracked_minutes` 50 and `tracked_minutes_occurrence` 10

#### Scenario: 1.0 readers keep the total
- **WHEN** a repeating task has 30 minutes tracked before a completion and 10 after
- **THEN** `tracked_minutes` is 40, a routine condition `tracked: {min_minutes: 30}` matches it, a saved view `tracked >= 30m` lists it, and `tracked occurrence >= 30m` does not

#### Scenario: A task that does not repeat
- **WHEN** a task without a rule has 30 minutes tracked
- **THEN** `get_task` returns `tracked_minutes` 30 and no `tracked_minutes_occurrence`

#### Scenario: A habit's skip starts a new occurrence
- **WHEN** a habit with 20 minutes tracked is skipped and nothing is tracked on the next occurrence
- **THEN** its row shows no tracked time and `tracked occurrence` does not match it, while `tracked` still does

#### Scenario: Undo of a completion
- **WHEN** the user completes a repeating task with 40 minutes tracked and chooses Undo
- **THEN** the trashed occurrence record no longer counts and the row reads `40m / 30m` again

#### Scenario: A plain skip writes no record
- **WHEN** a repeating task that is not a habit is skipped
- **THEN** no occurrence starts there and its tracked time stays with the next occurrence

#### Scenario: Reports keep every entry
- **WHEN** the user exports the week's entries of a repeating task completed twice that week
- **THEN** the CSV lists every entry of both occurrences, and Statistics counts them on their days
