# Spec Delta

## ADDED Requirements

### Requirement: Ordinal weekday phrases
The parser SHALL recognise an ordinal weekday as a one-off date: an optional article, an ordinal (`first`…`fourth`, `last`, or a number from 1 to 4 with an ordinal suffix such as `2nd`, `2.`, `2º`, `2e`), a weekday name, and optionally `of` with a month name (and optional year) or the bundled "of the month" phrase, each in every active language. The phrase SHALL be removed from the title and SHALL combine with a time like any date.

#### Scenario: Second Monday still ahead
- **WHEN** today is Friday 2026-10-09 and the user enters `Dentist second Monday` or `Dentist 2nd monday`
- **THEN** the task is titled `Dentist`, due `2026-10-12`, and the due chip reads that date

#### Scenario: Ordinal weekday with a time
- **WHEN** today is 2026-10-09 and the user enters `Board second Tuesday at 10:00`
- **THEN** the task is due `{date: "2026-10-13", time: "10:00"}` with the title `Board`

#### Scenario: Each language
- **WHEN** today is 2026-10-09 and the user enters, with that language active, `Treffen am zweiten Montag`, `Réunion le deuxième lundi`, `Riunione secondo lunedì`, `Reunión segundo lunes` or `Reunião segunda segunda-feira`
- **THEN** every task is due `2026-10-12` with the title `Treffen`, `Réunion`, `Riunione`, `Reunión` or `Reunião`

#### Scenario: Named month in each language
- **WHEN** today is 2026-10-09 and the user enters `Bericht dritten Freitag im November`, `Rapport le 3e vendredi de novembre`, `Rapporto terzo venerdì di novembre`, `Informe tercer viernes de noviembre` or `Relatório terceira sexta-feira de novembro`
- **THEN** every task is due `2026-11-20`

#### Scenario: Last weekday in each language
- **WHEN** today is 2026-10-09 and the user enters `Abschluss letzten Freitag`, `Clôture dernier vendredi`, `Chiusura ultimo venerdì`, `Cierre último viernes` or `Fecho última sexta`
- **THEN** every task is due `2026-10-30`

#### Scenario: Portuguese weekday alone is not an ordinal
- **WHEN** Portuguese is active, today is 2026-10-09 and the user enters `Reunião quarta`
- **THEN** the task is due Wednesday `2026-10-14`, because `quarta` counts as "fourth" only directly before a weekday name

#### Scenario: Ordinal without a weekday stays literal
- **WHEN** the user enters `Pay the second invoice`
- **THEN** no due date is set and the title is `Pay the second invoice`

### Requirement: Ordinal weekday resolution
Without a month, an ordinal weekday SHALL resolve to that weekday of the current month when it is today or later, else of the next month. With a month, it SHALL resolve to that month's occurrence in the current year when today or later, else in the next year. A fifth occurrence SHALL never be offered.

#### Scenario: First Monday already past rolls to next month
- **WHEN** today is Friday 2026-10-09 and the user enters `Pay rent first Monday`
- **THEN** the task is due `2026-11-02`

#### Scenario: Last Friday of the month
- **WHEN** today is 2026-10-09 and the user enters `Close books last Friday`
- **THEN** the task is titled `Close books` and due `2026-10-30`

#### Scenario: Named month with an article
- **WHEN** today is 2026-10-09 and the user enters `Report the 3rd Friday of November`
- **THEN** the task is titled `Report` and due `2026-11-20`

#### Scenario: Named month already past rolls to next year
- **WHEN** today is 2026-10-09 and the user enters `Audit first Friday of October`
- **THEN** the task is due `2027-10-01`

#### Scenario: One-off "of the month"
- **WHEN** today is 2026-10-09 and the user enters `Bins last Wednesday of the month`
- **THEN** the task is titled `Bins` and due `2026-10-28`

### Requirement: Ordinal weekday chips and storage
An ordinal weekday date SHALL get the ordinary due chip and SHALL be dismissable like any date, keeping its text in the title. Parsing SHALL stay a pure, offline function of the line, the reference date and the active languages; the task SHALL store the resolved date as its due value, so other devices never re-parse the line and converge on it like any due value.

#### Scenario: Dismissed ordinal weekday
- **WHEN** the user types `Review notes from last Friday` and dismisses the due chip
- **THEN** the title is `Review notes from last Friday`, the task has no due date, and the chip does not reappear while that text is unchanged

#### Scenario: Offline capture
- **WHEN** the device is offline and the user enters `Board second Tuesday #work`
- **THEN** the task is created locally with the resolved date and project, survives a reload, and uploads on the next successful sync

## MODIFIED Requirements

### Requirement: Recurrence phrases
The parser SHALL recognise a recurrence phrase in the quick-add line and SHALL store it as the canonical English rule of the recurring-tasks grammar. Phrases SHALL cover every pattern of that grammar, including `after completion`, `until <date phrase>` and `for N times`, plus one-word forms (`daily`, `weekly`, `monthly`, `yearly`). After a monthly pattern (an ordinal weekday, a day of the month, `last day`, `last weekday`) the parser SHALL also swallow the bundled "of the month" phrase (`of the month`, `im Monat`, `du mois`, `del mese`, `del mes`, `do mês`), which changes nothing in the stored rule. An ordinal SHALL be an ordinal word or a number with an ordinal suffix; a bare number between the "every" word and a weekday SHALL be read as a count, which the grammar cannot express, so the whole phrase SHALL stay in the title and set neither a rule nor a date. The phrase SHALL be removed from the title; a phrase the grammar cannot express SHALL stay in it.

#### Scenario: Weekday rule
- **WHEN** the user enters `Water plants every Monday`
- **THEN** the task's title is `Water plants` and its rule is `every monday`

#### Scenario: Completion-relative rule with an interval
- **WHEN** the user enters `Change filter every 3 days after completion`
- **THEN** the rule is `every 3 days after completion`

#### Scenario: Ordinal weekday with an end date
- **WHEN** today is 2026-10-09 and the user enters `Board meeting every 2nd Tuesday until 31 Dec`
- **THEN** the rule is `every 2nd tuesday until 2026-12-31`

#### Scenario: Ordinal word and "of the month"
- **WHEN** today is Friday 2026-10-09 and the user enters `Board every second Monday` or `Board every 2nd monday of the month`
- **THEN** in both cases the title is `Board`, the rule is `every 2nd monday`, the task is due `2026-10-12`, and the recurrence chip reads `every 2nd monday · Mon 12 Oct`

#### Scenario: "Of the month" in each language
- **WHEN** today is 2026-10-09 and the user enters, with that language active, `jeden zweiten Montag im Monat`, `tous les 2e lundis du mois`, `ogni secondo lunedì del mese`, `cada segundo lunes del mes` or `toda segunda segunda-feira do mês` after a title
- **THEN** the rule is `every 2nd monday` in every case and nothing of the phrase remains in the title

#### Scenario: Last weekday of the month
- **WHEN** today is 2026-10-09 and the user enters `Close books every last friday of the month`
- **THEN** the rule is `every last friday`, the title is `Close books` and the task is due `2026-10-30`

#### Scenario: A count before a weekday is not an ordinal
- **WHEN** the user enters `Board every 2 Mondays`, `Treffen alle 2 Montage`, `Réunion tous les 2 lundis`, `Riunione ogni 2 lunedì`, `Reunión cada 2 lunes` or `Reunião cada 2 segundas-feiras`, with that language active
- **THEN** no rule is set, no due date is set, no chip is shown, and the title is the line as typed

#### Scenario: One-word form
- **WHEN** the user enters `Standup daily at 9:30`
- **THEN** the rule is `every day` and the task is due at `09:30`

#### Scenario: Unsupported phrase stays literal
- **WHEN** the user enters `Check logs every 3 hours`
- **THEN** no rule is set, no recurrence chip is shown and the title is `Check logs every 3 hours`

#### Scenario: Only the first rule counts
- **WHEN** the user enters `Pay rent every month every 1st`
- **THEN** the rule is `every month` and the title is `Pay rent every 1st`
