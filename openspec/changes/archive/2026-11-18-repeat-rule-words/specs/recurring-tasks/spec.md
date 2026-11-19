## ADDED Requirements

### Requirement: A rule reads in the interface language
Wherever the web app shows a task's repeat rule as text (the Repeat segment of the When popover, the task's facts line, the Repeats chip of quick add and a proposed change in the assistant's review), it SHALL show the rule in words of the interface language, built from the parsed rule: the interval or pattern, then "after completion", the end date in the user's date format or the number of times when the rule has them. On its own line the rule SHALL start with a capital letter where the language has one; after other words (the facts line, the chip) it SHALL start small. Weekday and month names SHALL be those of the interface language, and an ordinal SHALL agree with its weekday where the language requires it. The stored rule SHALL stay the canonical English form and the Repeat field SHALL keep showing and accepting that form; a rule the app cannot parse SHALL be shown as stored. The words SHALL be derived on the device, offline included, and SHALL be written nowhere, so there is nothing to converge beyond the rule itself.

#### Scenario: Dutch
- **WHEN** the interface language is Dutch and a task's rule is `every 3 days after completion`
- **THEN** the Repeat segment reads "Om de 3 dagen na voltooiing", the task's facts line "om de 3 dagen na voltooiing", and the stored rule is unchanged

#### Scenario: Ordinal weekday
- **WHEN** the interface language is Italian and a task's rule is `every last sunday`
- **THEN** the rule reads "Ogni mese l’ultima domenica"

#### Scenario: Several weekdays every other week
- **WHEN** the interface language is English and a task's rule is `every 2 weeks on monday, thursday`
- **THEN** the rule reads "Every 2 weeks on Monday and Thursday"

#### Scenario: Ends
- **WHEN** the interface language is English and a task's rule is `every week for 10 times`
- **THEN** the rule reads "Every week, 10 times"

#### Scenario: Quick add
- **WHEN** the interface language is German and the user types "Filter wechseln jeden Montag" in quick add
- **THEN** the Repeats chip reads "jede Woche am Montag" and the task is created with the rule `every monday`

#### Scenario: A rule of a newer version
- **WHEN** a task's stored rule does not parse on this device
- **THEN** the rule is shown as stored

#### Scenario: Offline
- **WHEN** the device is offline and the user changes the interface language
- **THEN** every rule reads in the new language, and nothing is written or uploaded

## MODIFIED Requirements

### Requirement: Repeat presets
The Repeat segment of the When popover SHALL show the current rule in words when one is set (see "A rule reads in the interface language"), then the presets Every day, Every weekday, Every week on the due date's weekday, Every month on the due date's day, Every year on the due date's day and month, and Custom…, which opens the full rule editor in place. A preset SHALL write the same rule the full editor writes for it. Without a due date, the presets SHALL name today's weekday and day. Offline, a preset SHALL apply at once and converge like any other rule edit.

#### Scenario: Weekly preset
- **WHEN** a task is due Thursday 2026-10-22 and the user chooses "Every week on Thursday"
- **THEN** the task repeats weekly on Thursday, and the segment reads "Every week on Thursday" above the presets

#### Scenario: Custom rule
- **WHEN** the user chooses Custom…
- **THEN** the full rule editor opens inside the segment with the current rule, and nothing is written until it is changed

#### Scenario: Offline preset
- **WHEN** the device is offline and the user chooses Every day
- **THEN** the rule applies locally at once, and syncs with the usual last-writer-wins rule when the device is back online
