## MODIFIED Requirements

### Requirement: Deadline phrases
The parser SHALL recognise the word `deadline`, or its bundled equivalent in each active language, directly before a date phrase, and SHALL set the task's deadline to that date instead of its due date. The date SHALL resolve by the existing rules (today or later), a time after it SHALL stay in the title, and the deadline SHALL get its own chip. The parser SHALL also recognise a `by` word (English `by`, German `bis`, Italian `entro`, Portuguese `até`) directly before a date phrase that has no time after it, and SHALL set the deadline the same way. A `by` word before a time, or before a date followed by a time, SHALL set the due date and time and be removed with them. `on` and `due` (and French `pour`, Spanish `para`) SHALL keep setting the due date. A rule's end date (`bis Juni` in `jeden Montag bis Juni`) SHALL stay part of the rule. Only the first deadline phrase in a line SHALL count. The web parser and the CLI's parser SHALL give the same result for every shared vector.

#### Scenario: Deadline only
- **WHEN** today is Wednesday 2026-10-14 and the user enters `Send report deadline friday`
- **THEN** the task is titled `Send report`, has no due date and the deadline `2026-10-16`, and a deadline chip is shown

#### Scenario: Plan and deadline
- **WHEN** the user enters `Send report tomorrow deadline friday` on 2026-10-14
- **THEN** the task is due `2026-10-15` with the deadline `2026-10-16`

#### Scenario: German phrase
- **WHEN** German is active and the user enters `Bericht Frist 3. November`
- **THEN** the task is titled `Bericht` with the deadline `2026-11-03`

#### Scenario: Dismissed chip
- **WHEN** the user dismisses the deadline chip of `Review deadline policy tomorrow`
- **THEN** the title keeps `deadline policy` and the task is due tomorrow with no deadline

#### Scenario: By sets the deadline
- **WHEN** today is 2026-10-09 and the user enters `Install winter tires by March 31`
- **THEN** the task is titled `Install winter tires`, has no due date and the deadline `2027-03-31`, and the deadline chip and the palette's Deadline row are shown

#### Scenario: On and due keep the due date
- **WHEN** the user enters `Install winter tires on March 31` or `Install winter tires due March 31` on 2026-10-09
- **THEN** the task is due `2027-03-31` with no deadline

#### Scenario: By before a time
- **WHEN** the user enters `call back by 5pm` on 2026-10-09
- **THEN** the task is titled `call back`, due 2026-10-09 at 17:00, with no deadline

#### Scenario: By before a date with a time
- **WHEN** the user enters `Pay tax by friday 5pm` on Friday 2026-10-09
- **THEN** the task is titled `Pay tax`, due 2026-10-16 at 17:00, with no deadline

#### Scenario: Due date and by deadline
- **WHEN** the user enters `Pay tax tomorrow by friday` on Friday 2026-10-09
- **THEN** the task is due 2026-10-10 with the deadline 2026-10-16, the same as `Pay tax tomorrow deadline friday`

#### Scenario: Rules are unchanged
- **WHEN** the user enters `Water plants every monday`, or with German active `Gießen jeden Montag bis Juni`
- **THEN** the rule is `every monday` (with its end in June for the German line) and the task has no deadline

#### Scenario: By in other languages
- **WHEN** the user enters `Cambiare gomme entro il 31 marzo` (Italian), `Reifen wechseln bis Freitag` (German) or `Trocar pneus até sexta` (Portuguese) on 2026-10-09
- **THEN** each task has the deadline and no due date, while `Rapport pour vendredi` (French) and `Informe para viernes` (Spanish) are due 2026-10-16 with no deadline

#### Scenario: By without a date
- **WHEN** the user enters `Book by Stephen King`
- **THEN** the title is unchanged and the task has no due date and no deadline
