# Spec Delta

## MODIFIED Requirements

### Requirement: Attribute tokens
The quick-add line SHALL recognise `#<name>` as a project reference, `@<name>` as a label, `p1`–`p4` as a priority (1 highest, 4 lowest), `+<duration>` (`+30m`, `+2h`, `+1h30`) as a duration estimate in minutes, and `<spent>/<estimate>` (`30m/2h`, `1h/1h30`, `45min/2h`) as time already spent and an estimate, where both parts carry a unit. A `#` token SHALL match a non-archived, non-deleted project by case-insensitive name, exact match first and unique prefix second; a token that matches no project SHALL stay in the title unchanged. Recognised tokens SHALL be removed from the title and surrounding whitespace collapsed. Time spent SHALL become one closed time entry ending at creation, written in the same batch as the task.

#### Scenario: Full line
- **WHEN** the user enters `Meeting with Sarah #work @call p1 +30m` and a project named "Work" exists
- **THEN** the created task has title `Meeting with Sarah`, project "Work", labels `["call"]`, priority 1 and estimate 30 minutes

#### Scenario: Unknown project token stays literal
- **WHEN** the user enters `Read #ambiguous` and no project name starts with "ambiguous"
- **THEN** the title is `Read #ambiguous` and the task goes to the context's default project

#### Scenario: Ambiguous prefix is not guessed
- **WHEN** projects "Home" and "Homework" exist and the user enters `Fix sink #hom`
- **THEN** the token is not resolved, the title keeps `#hom`, and the preview shows no project chip

#### Scenario: Spent and estimate
- **WHEN** the user enters `Draft the offer 30m/2h` at 10:00
- **THEN** the task has title `Draft the offer`, estimate 120 minutes and one closed entry from 09:30 to 10:00, the preview shows a "Spent 30 min" chip beside the estimate chip, and the row reads `30m / 2h`

#### Scenario: Plus stays an estimate only
- **WHEN** the user enters `Draft the offer +30m`
- **THEN** the task has estimate 30 minutes and no time entry

#### Scenario: Dates are not durations
- **WHEN** the user enters `Pay rent 30/12` in a day-month language
- **THEN** `30/12` is a date and no entry is created, because both parts of a spent token need a unit

#### Scenario: Same in every language
- **WHEN** the line `Angebot schreiben 30m/2h` is parsed with German active, or `Rédiger l'offre 1h/2h` with French active
- **THEN** the result is 30 (or 60) minutes spent and a 120-minute estimate, while `Réunion 15h` with French active still means a meeting at 15:00, and every case is in the shared vectors run by the web and server parsers
