# Spec Delta

## MODIFIED Requirements

### Requirement: Metadata language
Row metadata SHALL use three styles only: tone text for the date and the deadline (the deadline with its icon), label chips, and neutral chips for estimate (reading `tracked / estimate` once time was tracked, or `tracked` alone without an estimate), subtask progress, comment count, attachment count and project. Repeat and evening SHALL be a suffix of the date text, not separate glyphs. The project SHALL not be shown in the Inbox or inside that project's view. Counts SHALL use tabular figures, not a monospace face.

#### Scenario: Recurring evening task
- **WHEN** a task is due today, repeats every day and is marked for the evening
- **THEN** its metadata reads "Today · evening · repeats" in the date tone, with no separate icons

#### Scenario: Inbox rows
- **WHEN** the Inbox is shown
- **THEN** no row carries an "Inbox" chip

#### Scenario: Tracked time stays one chip
- **WHEN** a task estimated at one hour has 35 minutes tracked
- **THEN** its row carries one neutral chip reading `35m / 1h`, no second chip and no new glyph, so the number of visible properties is unchanged
