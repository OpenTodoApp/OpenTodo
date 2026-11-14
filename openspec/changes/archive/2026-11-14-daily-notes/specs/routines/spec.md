## ADDED Requirements

### Requirement: Get the daily note step
The catalogue SHALL offer, in the group Notes and text, **Get the daily note** with the input date (Date; the day of the run, in the run-as user's time zone and day start, when empty) and the output Note: that day's daily note of the run-as user, created from the user's daily-notes settings as `daily-notes` "One note per day" states when it does not exist yet or is in the Trash. The creation SHALL be planned with the rest of the run, so a run that fails at a later step creates nothing. The step SHALL be available only while the run-as user's Daily notes setting is on, with reason `daily_notes_off` and the Daily notes setting otherwise. It SHALL be a content step on an encrypted account. A routine of a workspace SHALL fail at the step with reason `other_workspace` when the setting's project is in another workspace, writing nothing.

#### Scenario: What I finished today
- **WHEN** the routine "Done today" (schedule every day 18:00: Find tasks `completed = today` → Format text "Done: {titles}" → Get the daily note → Add to a note) runs on 2026-11-12 and the user wrote nothing in today's note yet
- **THEN** the note of 2026-11-12 is created from the template with "Done: …" at its end, and every device shows one note for that day after sync

#### Scenario: Converges with a device
- **WHEN** the run above happens while the user's phone, offline, has also created today's note with a line
- **THEN** after the phone syncs there is one note for the day, with the template text once, the phone's line and the routine's text

#### Scenario: Setting off
- **WHEN** the user turns Daily notes off and the routine runs
- **THEN** the run fails at Get the daily note with reason `daily_notes_off` and the Daily notes setting, and nothing is written
