# Spec Delta

## MODIFIED Requirements

### Requirement: Streak derived from the schedule and the records
A habit's scheduled dates SHALL be the dates its calendar rule matches plus any date with an occurrence record. The current streak SHALL count consecutive scheduled dates with a record (done or skipped), walking back from the date before the current occurrence. The current occurrence SHALL be pending, never missed; an earlier scheduled date without a record ends the streak. The best streak is the longest such run. Both SHALL be computed on the device only. Where the computation compares with "today" (the occurrence is at risk once its date is before today; the month grid marks today), today SHALL be the user's logical today (OpenSpec `date-time-preferences`, "Logical today"). A record's date stays the occurrence's due date, whatever the clock said when it was written.

#### Scenario: Three days in a row
- **WHEN** a habit with `every day` has records for the 11th, 12th and 13th and is due on the 14th, not yet done
- **THEN** the streak is 3, shown without an "at risk" mark until the day is over

#### Scenario: Missed day breaks the chain
- **WHEN** the same habit has records for the 11th and 13th but none for the 12th
- **THEN** the streak is 1

#### Scenario: Skipped day keeps the chain
- **WHEN** the same habit has done records for the 11th and 13th and a skipped record for the 12th
- **THEN** the streak is 2, because the skipped day neither breaks nor extends it

#### Scenario: Weekly habit
- **WHEN** a habit with `every mon, wed, fri` has records for Monday and Wednesday and is due on Friday
- **THEN** the streak is 2 and Tuesday and Thursday are not counted as missed

#### Scenario: Same answer on every device
- **WHEN** two devices hold the same series and records
- **THEN** both show the same streak, since it is a function of the rule, the due date and the records alone

#### Scenario: Done after midnight with a day start
- **WHEN** the day start is `04:00`, a habit with `every day` is due on the 14th, and the user completes it at 01:30 on the 15th
- **THEN** the record is for the 14th, the series is due on the 15th, the 14th shows as done, the streak counts it, and the 15th is pending and not at risk until 04:00 has passed on the 16th

#### Scenario: Midnight default is unchanged
- **WHEN** the day start is `00:00`
- **THEN** "at risk" and the month grid's today are those of the calendar date, as before
