## ADDED Requirements

### Requirement: Skipping an occurrence is a step
Skipping the current occurrence of a repeating task, from the list's skip key, the command palette, the task panel or its repeat field, SHALL record one step in the undo history named "Occurrence skipped", or "Day skipped" for a habit, as the calendar's skip is named. It SHALL NOT show the Undo toast. Undoing the step SHALL put the series back on the skipped date and, for a habit, SHALL write back its occurrence record as an untouched open occurrence on that date, never moving it to the Trash (series-exceptions D3); redoing it SHALL skip again. Skips SHALL run one after the other, each planned from the last one's result. When there is no occurrence to skip, nothing SHALL be written or recorded. The change SHALL be written locally first, offline too, as ordinary ops that converge through sync.

#### Scenario: Undo a skip
- **WHEN** a person skips Monday's occurrence of a weekly task and then presses Ctrl/Cmd-Z with no field focused
- **THEN** the task is due on Monday again

#### Scenario: Undo a habit's skip
- **WHEN** a person skips today's occurrence of a daily habit and then undoes it
- **THEN** the habit is due today again, the day is not marked skipped, and nothing is in the Trash
