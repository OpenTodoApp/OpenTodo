## MODIFIED Requirements

### Requirement: Every other phrases
The parser SHALL read "every other" before a unit or a weekday as a repeat every 2 of that unit: `every other day`, `week`, `month` and `year` SHALL set `every 2 days`, `every 2 weeks`, `every 2 months` and `every 2 years`, and `every other <weekday>` SHALL set `every 2 weeks on <weekday>`, with the task due on the first such weekday on or after today unless the line has its own date phrase. `every N weeks on <weekday>` and its bundled equivalents (`alle 2 Wochen am Samstag`, `toutes les 2 semaines le samedi`, `ogni 2 settimane il sabato`, `cada 2 semanas los sábados`, `cada 2 semanas aos sábados`) SHALL set the same rule. The bundled equivalents SHALL be `jeden zweiten`, `jede zweite`, `jedes zweite`, `alle zwei`; `un … sur deux`, `une … sur deux`, `tous les deux`, `toutes les deux`; `ogni due`, `a giorni alterni`, `a settimane alterne`, `a mesi alterni`, `ad anni alterni`; `cada dos`; `a cada dois`, `a cada duas`, `cada dois`, `cada duas`. The phrase SHALL be removed from the title. A German ordinal weekday followed by "of the month" (`jeden zweiten Montag im Monat`) SHALL keep its monthly reading. The TypeScript parser and the Go port SHALL agree on shared vectors.

#### Scenario: Every other weekday
- **WHEN** today is Wednesday 2026-10-28 and the user enters `Send timesheet every other friday`
- **THEN** the title is `Send timesheet`, the rule is `every 2 weeks on friday` and the task is due 2026-10-30

#### Scenario: Every other weekday with a date of its own
- **WHEN** today is Wednesday 2026-11-04 and the user enters `take the bins out today and repeat every other Saturday`
- **THEN** the title is `take the bins out`, the rule is `every 2 weeks on saturday`, the task is due 2026-11-04, and completing it makes it due Saturday 2026-11-07

#### Scenario: Every other unit
- **WHEN** today is 2026-10-28 and the user enters `Review budget every other week`, `Pay invoice every other month`, `Water ferns every other day` or `Renew passport every other year`
- **THEN** the rule is `every 2 weeks`, `every 2 months`, `every 2 days` or `every 2 years`, the task is due 2026-10-28 and the phrase leaves the title

#### Scenario: Every other weekday in each language
- **WHEN** today is 2026-10-28 and the user enters, with that language active, `Stundenzettel senden jeden zweiten Freitag`, `Envoyer la feuille de temps un vendredi sur deux`, `Inviare il foglio ore ogni due venerdì`, `Enviar la hoja de horas cada dos viernes` or `Enviar a folha de horas a cada duas sextas`
- **THEN** the rule is `every 2 weeks on friday`, the task is due 2026-10-30 and only the words before the phrase remain in the title

#### Scenario: Week interval on a weekday in each language
- **WHEN** today is 2026-11-04 and the user enters `Review every 2 weeks on friday`, or with that language active `Training alle 2 Wochen am Samstag`, `Sport toutes les 2 semaines le samedi` or `Correr cada 2 semanas los sábados`
- **THEN** the rule is `every 2 weeks on friday` (2026-11-06) or `every 2 weeks on saturday` (2026-11-07), the task is due on that date and only the words before the phrase remain in the title

#### Scenario: Every other unit in each language
- **WHEN** the user enters, with that language active, `jede zweite Woche`, `une semaine sur deux`, `ogni due settimane`, `a settimane alterne`, `cada dos semanas` or `a cada duas semanas` after a title
- **THEN** the rule is `every 2 weeks`

### Requirement: Recurrence sets the first occurrence
When the line carries a rule and no date phrase, the task's due date SHALL be the rule's first occurrence on or after today, computed locally, and the recurrence chip SHALL show that date. A start phrase directly before or after the recurrence phrase (`starting`, `starting on`, `starting from`, `beginning`, `from`, `as of` followed by a date phrase, and the bundled equivalents such as `ab`, `beginnend am`, `à partir de`, `dès`, `a partir de`, `desde`, `a partire da`, `da`, `começando em`) SHALL be part of the recurrence phrase and SHALL make the due date the rule's first occurrence on or after that date. When the line carries a date phrase of its own, that date SHALL be the due date and the rule applies from it, even when it is not one of the rule's weekdays; a time in the line SHALL be the series' due time. A start word without a recurrence phrase next to it SHALL stay in the title. The rule and the due date SHALL be written in the same operation set as the task, so the task works offline and converges like any created task.

#### Scenario: First occurrence from today
- **WHEN** today is Friday 2026-10-09 and the user enters `Water plants every Monday`
- **THEN** the task is due `2026-10-12` and the chip reads the rule with that date

#### Scenario: Typed date anchors the series
- **WHEN** today is 2026-10-09 and the user enters `Invoice every month 3 Nov at 10:00`
- **THEN** the task is due `{date: "2026-11-03", time: "10:00"}` with the rule `every month`

#### Scenario: View default does not override the rule's date
- **WHEN** the user enters `Review every Friday` in the Today view on a Wednesday
- **THEN** the task is due on Friday, not today

#### Scenario: Start phrase after the rule
- **WHEN** today is Wednesday 2026-11-04 and the user enters `take the bins out every other saturday starting today` or `take the bins out every other saturday starting next week`
- **THEN** the title is `take the bins out`, the rule is `every 2 weeks on saturday` and the task is due 2026-11-07, or 2026-11-14 for the second line

#### Scenario: Start phrase before the rule
- **WHEN** today is 2026-11-04 and the user enters `Stretch starting tomorrow every day` or `Gym every monday from November 16`
- **THEN** the titles are `Stretch` and `Gym`, the rules `every day` and `every monday`, and the tasks are due 2026-11-05 and 2026-11-16

#### Scenario: Start phrase in each language
- **WHEN** today is 2026-11-04 and the user enters, with that language active, `Müll rausbringen jeden zweiten Samstag ab heute`, `Sortir les poubelles un samedi sur deux à partir de demain`, `Sacar la basura cada dos sábados a partir de mañana`, `Spazzatura ogni due venerdì a partire da domani` or `Levar o lixo a cada duas sextas a partir de amanhã`
- **THEN** nothing of the start phrase remains in the title, and the task is due on the rule's first weekday on or after that date

#### Scenario: Start word without a rule
- **WHEN** the user enters `Call mom starting tomorrow`, `Leave from Monday` or `Work from home every friday`
- **THEN** the titles are `Call mom starting`, `Leave from` and `Work from home`

## ADDED Requirements

### Requirement: Connectors before a recurrence phrase
A connector directly before a recurrence phrase, or before the start phrase in front of it, SHALL be part of the recurrence phrase and SHALL leave the title with it: `and repeat`, `and repeating`, `repeat`, `repeating`, `repeats`, `recurring`, `and then`, `then` and `and`, and in the other bundled languages `und wiederholen`, `wiederholen`, `und dann`, `dann`, `und`; `et répéter`, `répéter`, `et ensuite`, `et puis`, `puis`, `et`; `y repetir`, `repetir`, `y luego`, `luego`, `y después`, `y`; `e ripeti`, `ripeti`, `ripetere`, `e poi`, `poi`, `e`; `e repetir`, `repetir`, `e depois`, `depois`, `e`. A connector without a recurrence phrase after it SHALL stay in the title. Dismissing the recurrence chip SHALL keep the connector in the title with the rest of the phrase. The TypeScript parser and the Go port SHALL agree on shared vectors.

#### Scenario: And repeat
- **WHEN** today is 2026-11-04 and the user enters `Water plants repeat every monday`, `Water plants repeating every monday` or `Call mom tomorrow and then every sunday`
- **THEN** the titles are `Water plants` and `Call mom`, with the rules `every monday` and `every sunday`

#### Scenario: Connectors in each language
- **WHEN** today is 2026-11-04 and the user enters, with that language active, `Müll rausbringen heute und dann jeden zweiten Samstag`, `Sortir les poubelles aujourd'hui et répéter un samedi sur deux`, `Sacar la basura hoy y repetir cada dos sábados`, `Portare fuori la spazzatura oggi e poi ogni due venerdì` or `Levar o lixo hoje e repetir a cada duas sextas`
- **THEN** only the words before the date remain in the title, the task is due 2026-11-04 and the rule is `every 2 weeks on saturday` or `every 2 weeks on friday`

#### Scenario: Repeat in a title
- **WHEN** the user enters `Repeat the test`, `Repeat the test tomorrow`, `Test wiederholen`, `Répéter la scène`, `Repetir el examen`, `Ripetere il test` or `Repetir o teste`
- **THEN** no rule is set and the word stays in the title
