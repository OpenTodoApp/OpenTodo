## MODIFIED Requirements

### Requirement: Multi-language vocabulary
Date, time, recurrence and reminder vocabulary SHALL be bundled for English, German, French, Italian, Spanish, Portuguese and Dutch, available with no network. A community language (OpenSpec `localization` "Community languages") MAY have no vocabulary. The active set SHALL be the interface language (OpenSpec `localization`) when not `system`, then the browser's bundled preferred languages, with English always active, overridable in Settings on the device. Attribute tokens (`#`, `@`, `p1`–`p4`, `+`) SHALL be language-independent. The stored rule SHALL always be the canonical English form.

#### Scenario: German phrase
- **WHEN** the browser language is `de` and the user enters `Zahnarzt nächsten Mittwoch um 15 Uhr`
- **THEN** the task is due next Wednesday at `15:00` with title `Zahnarzt`

#### Scenario: English always works
- **WHEN** the browser language is `it` and the user enters `Pay rent tomorrow`
- **THEN** the task is due tomorrow with title `Pay rent`

#### Scenario: Unsupported language falls back
- **WHEN** the browser language is one with no bundled vocabulary
- **THEN** English vocabulary is active, attribute tokens still work, and no error is shown

#### Scenario: Interface language comes first
- **WHEN** the browser language is `en-US`, the interface language is Spanish and the device has no language override
- **THEN** the active languages are Spanish then English, `Pagar alquiler mañana` is due tomorrow, numeric dates read day-month while the date format is `system`, and dictation listens in Spanish

#### Scenario: Device override still wins
- **WHEN** the interface language is Spanish and the device's quick-add languages are set to German only
- **THEN** the active languages are German then English

#### Scenario: Recurrence in each language
- **WHEN** the user enters `jeden Montag`, `tous les lundis`, `ogni lunedì`, `cada lunes` or `toda segunda-feira` after a title, with that language active
- **THEN** the rule is `every monday` in every case

#### Scenario: French interval with completion
- **WHEN** the browser language is `fr` and the user enters `Changer le filtre tous les 3 jours après achèvement`
- **THEN** the rule is `every 3 days after completion` and the title is `Changer le filtre`

#### Scenario: Reminder in each language
- **WHEN** the user enters `rappelle-moi 30 min avant`, `ricordamelo 30 minuti prima`, `recuérdame 30 minutos antes` or `lembre-me 30 minutos antes` after a timed task, with that language active
- **THEN** a relative reminder with offset −30 minutes is created in every case

#### Scenario: Dutch phrase
- **WHEN** Dutch is active, today is Friday 2026-10-09 and the user enters `Tandarts volgende woensdag om 15 uur`
- **THEN** the task is due `{date: "2026-10-14", time: "15:00"}` with title `Tandarts`

#### Scenario: Dutch half hour
- **WHEN** Dutch is active and the user enters `Bellen morgen om half 4 's middags`
- **THEN** the task is due tomorrow at `15:30` with title `Bellen`

#### Scenario: Dutch recurrence and reminder
- **WHEN** Dutch is active and the user enters `Filter vervangen elke 3 dagen na voltooiing`, then `Overleg morgen om 10 uur herinner me 30 minuten van tevoren`
- **THEN** the first rule is `every 3 days after completion` with title `Filter vervangen`, and the second task has a relative reminder with offset −30 minutes

#### Scenario: Dutch abbreviation needs a date context
- **WHEN** Dutch is active and the user enters `Bel ma`, then `Bel ma om 9 uur`
- **THEN** the first task has no due date and the title `Bel ma`, and the second is due next Monday at `09:00` with the title `Bel`

#### Scenario: Dutch words inactive
- **WHEN** only English is active and the user enters `Fix the door over lunch`
- **THEN** no attribute is parsed and the title is `Fix the door over lunch`

#### Scenario: Same result in Go
- **WHEN** the shared vectors' Dutch rows run through the server's quick-add parser
- **THEN** every row produces the same title, due, recurrence and reminder as the web parser
