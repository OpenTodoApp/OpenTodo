## ADDED Requirements

### Requirement: Split a series from an occurrence
For a series with a calendar rule, an editor SHALL be able to change it from an occurrence after the current one onward ("This and following"). The first such change SHALL write, in one batch offered with one Undo: the series' rule with its end replaced by `until` the day before that occurrence date; a new series, the piece, whose id is derived from the series id and that date, carrying the series' fields with the change applied, the additive `split_from` value `{series, date}`, the habit flag, the series' end condition, and a due date on the first occurrence of its rule from that date that is not an exception; copies of the series' relative reminders with derived ids; and the change on the series' open occurrence records dated on or after that date that still hold the previous value. Occurrences before that date, and done or skipped records on or after it, SHALL be unchanged. The split SHALL work offline; two devices splitting the same series at the same date SHALL converge on one piece whose fields follow per-field last-writer-wins. "This and following" SHALL NOT be offered on the current occurrence (an All-occurrences edit does the same there) nor for a completion-relative rule.

#### Scenario: Study at 19:00 from Wednesday
- **WHEN** "Study" repeats `every weekday` at 18:00, is due Monday the 12th, and the user changes the time to 19:00 under This and following on Wednesday the 14th
- **THEN** "Study" is still due the 12th at 18:00 with `every weekday until 2026-10-13`, a new "Study" series is due the 14th at 19:00 with `every weekday`, and Tuesday the 13th still shows its 18:00 projection

#### Scenario: Same split on two offline devices
- **WHEN** two devices offline split the same series at the 14th, one changing the time and the other the title, and both sync
- **THEN** every device holds one piece starting on the 14th with both changes

#### Scenario: Moved occurrence after the split keeps its own time
- **WHEN** Thursday the 15th had been moved alone to 20:00 before the series was changed to 19:00 from the 14th
- **THEN** Thursday's occurrence stays at 20:00 and is not projected again by the piece

#### Scenario: Undo
- **WHEN** the user presses Undo on the toast after a split
- **THEN** the series has its previous rule again, the piece is gone, and no occurrence changed

### Requirement: Pieces of one lineage
A task SHALL have an optional `split_from` value holding a series id and a date, stored as one whole value, set when the piece is created, and rejected as invalid when it is not that shape, when the series is outside the task's sharing scope, when the task has no rule, or when it would change a value already set. The pieces of a lineage (the root series and every task whose `split_from` chain leads to it), ordered by their dates, SHALL each produce occurrences from their own date until the day before the next piece's date, and never after their own `until`; records of earlier pieces dated on or after a piece's date SHALL be exceptions of that piece. A device that may edit a piece whose stored `until` is later than that derived end, or missing, SHALL write the derived `until`, so every device converges. `for N times` SHALL count the done and open records of the whole lineage, earlier pieces' remaining occurrences first. The panel of a piece SHALL say which series it continues and from when, and the earlier series which piece continues it.

#### Scenario: Two splits at different dates offline
- **WHEN** device A splits a daily series at the 14th and device B splits it at the 20th, both offline, and both sync
- **THEN** the root runs to the 13th, A's piece from the 14th to the 19th, B's piece from the 20th, with no date shown twice, and the root's and A's rules carry those `until` dates on every device

#### Scenario: Twenty sessions stay twenty
- **WHEN** a series `every weekday for 20 times` with 8 done records is split from its 11th occurrence
- **THEN** the current occurrence and the projections of the old series and the piece number 12 together, the last on the date the series would have ended on

#### Scenario: Continues from
- **WHEN** the user opens the piece made on the 14th
- **THEN** the panel reads "Continues Study from 14 October" with a link to the earlier series, whose panel reads "Continues as Study from 14 October"

### Requirement: End a series from an occurrence
A projection's menu SHALL offer "Delete this and following" to editors, which SHALL set the series' rule to end the day before that occurrence (`until`), offline, with Undo, and create no piece. Records on or after that date SHALL stay as they are.

#### Scenario: Stop after the course ends
- **WHEN** "Spanish class" repeats `every tuesday`, is due the 13th, and the user chooses Delete this and following on the projection of 15 December
- **THEN** the rule becomes `every tuesday until 2026-12-14`, no projection is drawn from 15 December on, and one Undo restores the rule

### Requirement: This and following in the occurrence panel
The occurrence panel's scope control SHALL offer "This and following" between "This occurrence" and "All occurrences" on a projection or record of an occurrence after the current one, for a calendar rule and a user who may edit the series. Choosing it and editing a field SHALL perform the split; the panel SHALL then show the piece with All occurrences selected and a toast naming the date with Undo.

#### Scenario: Option offered
- **WHEN** an editor opens the projection of Wednesday the 14th of a weekday series due Monday the 12th
- **THEN** the scope control offers This occurrence, This and following and All occurrences, with This occurrence selected

#### Scenario: Not on the current occurrence
- **WHEN** the user opens the series row due Monday the 12th
- **THEN** the scope control offers This occurrence and All occurrences only

### Requirement: Split through the API and CLI
`POST /api/v1/tasks/{id}/split` with `from` (an occurrence date after the current one) and `changes` (task fields) SHALL split the series as the app does, through the op log, and answer the piece. It SHALL require a signed-in session or a token allowed to write tasks and refuse read and agent tokens. It SHALL answer 400 `not_an_occurrence` when `from` is not a later occurrence date or the rule is completion-relative, 400 `not_recurring` for a task without a rule, 400 `invalid_input` for invalid changes, 403 for a viewer and 404 for a task the caller cannot see. `ot task split <id> --from <date>` SHALL do the same from the CLI.

#### Scenario: Split from a script
- **WHEN** a script posts `{"from": "2026-10-14", "changes": {"due": {"date": "2026-10-14", "time": "19:00"}}}` to the split route of a weekday series due 2026-10-12 at 18:00
- **THEN** the answer is the piece due 2026-10-14 at 19:00 with `split_from` naming the series and that date, and the series' rule ends on 2026-10-13

#### Scenario: Not signed in
- **WHEN** the route is called without a session or token
- **THEN** it is answered 401 and nothing is written

#### Scenario: Split at the current occurrence
- **WHEN** a script posts `from` equal to the series' due date
- **THEN** the answer is 400 `not_an_occurrence` and nothing is written
