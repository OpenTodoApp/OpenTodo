## ADDED Requirements

### Requirement: Bare month names
A month name alone (without a day) SHALL be a date only while the line has no complete date phrase after it: a later relative day word, weekday, relative period, month and day, numeric date or `tonight`/`this morning` phrase SHALL replace it, and the month word SHALL then stay in the title. A second month name alone SHALL not replace the first. A month name alone directly after `from`, `since`, `of`, `for` or a bundled equivalent (`seit`, `von`, `vom`, `ab`, `für`; `depuis`, `de`, `du`, `des`; `da`, `dal`, `di`, `del`; `desde`, `de`, `del`; `desde`, `de`, `do`) SHALL stay text and set no date. The TypeScript parser and the Go port SHALL agree on shared vectors.

#### Scenario: Month in passing, date at the end
- **WHEN** today is Wednesday 2026-10-28 and the user enters `Collect the invoices from September and send them to the accountant next monday at 10am`
- **THEN** the task is due `{date: "2026-11-02", time: "10:00"}` and its title is `Collect the invoices from September and send them to the accountant`

#### Scenario: Month in passing in each language
- **WHEN** today is 2026-10-28 and the user enters, with that language active, `Rechnungen von September an den Steuerberater schicken nächsten Montag um 10 Uhr`, `Rassembler les factures de septembre pour le comptable lundi prochain à 10h`, `Raccogliere le fatture di settembre per il commercialista lunedì prossimo alle 10`, `Reunir las facturas de septiembre para el contador el próximo lunes a las 10` or `Juntar as faturas de setembro para o contador na próxima segunda às 10`
- **THEN** the task is due 2026-11-02 at 10:00 and the month word stays in the title

#### Scenario: A later date replaces a bare month
- **WHEN** today is 2026-10-28 and the user enters `September report tomorrow`
- **THEN** the task is due 2026-10-29 and its title is `September report`

#### Scenario: The only date phrase
- **WHEN** today is 2026-10-28 and the user enters `Pay rent in September`, `Miete zahlen im September`, `Payer le loyer en septembre`, `Pagare l'affitto a settembre`, `Pagar el alquiler en septiembre` or `Pagar o aluguel em setembro`, with that language active
- **THEN** the task is due 2027-09-01

#### Scenario: Month after "from" is text
- **WHEN** the user enters `File the invoices from September` or, with German active, `Rechnungen seit März ablegen`
- **THEN** no due date is set and the title is the line as typed

### Requirement: Every other phrases
The parser SHALL read "every other" before a unit or a weekday as a repeat every 2 of that unit: `every other day`, `week`, `month` and `year` SHALL set `every 2 days`, `every 2 weeks`, `every 2 months` and `every 2 years`, and `every other <weekday>` SHALL set `every 2 weeks` with the task due on the first such weekday on or after today unless the line has its own date phrase. The bundled equivalents SHALL be `jeden zweiten`, `jede zweite`, `jedes zweite`, `alle zwei`; `un … sur deux`, `une … sur deux`, `tous les deux`, `toutes les deux`; `ogni due`, `a giorni alterni`, `a settimane alterne`, `a mesi alterni`, `ad anni alterni`; `cada dos`; `a cada dois`, `a cada duas`, `cada dois`, `cada duas`. The phrase SHALL be removed from the title. A German ordinal weekday followed by "of the month" (`jeden zweiten Montag im Monat`) SHALL keep its monthly reading. The TypeScript parser and the Go port SHALL agree on shared vectors.

#### Scenario: Every other weekday
- **WHEN** today is Wednesday 2026-10-28 and the user enters `Send timesheet every other friday`
- **THEN** the title is `Send timesheet`, the rule is `every 2 weeks` and the task is due 2026-10-30

#### Scenario: Every other unit
- **WHEN** today is 2026-10-28 and the user enters `Review budget every other week`, `Pay invoice every other month`, `Water ferns every other day` or `Renew passport every other year`
- **THEN** the rule is `every 2 weeks`, `every 2 months`, `every 2 days` or `every 2 years`, the task is due 2026-10-28 and the phrase leaves the title

#### Scenario: Every other weekday in each language
- **WHEN** today is 2026-10-28 and the user enters, with that language active, `Stundenzettel senden jeden zweiten Freitag`, `Envoyer la feuille de temps un vendredi sur deux`, `Inviare il foglio ore ogni due venerdì`, `Enviar la hoja de horas cada dos viernes` or `Enviar a folha de horas a cada duas sextas`
- **THEN** the rule is `every 2 weeks`, the task is due 2026-10-30 and only the words before the phrase remain in the title

#### Scenario: Every other unit in each language
- **WHEN** the user enters, with that language active, `jede zweite Woche`, `une semaine sur deux`, `ogni due settimane`, `a settimane alterne`, `cada dos semanas` or `a cada duas semanas` after a title
- **THEN** the rule is `every 2 weeks`
