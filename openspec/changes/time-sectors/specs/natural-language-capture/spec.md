## ADDED Requirements

### Requirement: Time sector phrases
While the user's time sectors switch is on (OpenSpec `time-sectors`), the parser SHALL recognise these phrases, each with its bundled equivalent in every active language, and set the task's sector to the matching period on the viewer's local date and week start, with a dismissable chip:
- `this week`, `this month`, `this quarter` and `next quarter`;
- `sometime` followed by `this week`, `next week`, `this month`, `next month`, `this quarter` or `next quarter`.

`next week` and `next month` alone SHALL keep their date meaning. A line that also holds a date phrase SHALL take the date and keep the sector phrase in the title. While the switch is off, no sector phrase SHALL be recognised. The web parser and the Go parser (used by `ot add`, the quick-add parse route and the importer) SHALL produce the same result, pinned by shared vectors with the switch on and off. The quick-add parse route SHALL return the sector in its `fields` as `sector` and read the switch from the account's preference.

#### Scenario: This week
- **WHEN** the switch is on, today is 2026-10-28 with Monday weeks, and the user enters `Draft the budget this week #Work`
- **THEN** the task is titled `Draft the budget`, in "Work", with the sector `2026-W44` and no due date

#### Scenario: Next week keeps its date meaning
- **WHEN** the switch is on and the user enters `Call Ana next week` and then `Call Bo sometime next week`
- **THEN** the first task is due on the date `next week` gives today, and the second has the sector `2026-W45` and no due date

#### Scenario: Italian
- **WHEN** Italian is active, the switch is on and the user enters `Rinnovare l'assicurazione questo mese`
- **THEN** the task has the current month as its sector and the title `Rinnovare l'assicurazione`

#### Scenario: Switch off
- **WHEN** the switch is off and the user enters `Clean the garage this month`
- **THEN** the task is titled `Clean the garage this month` with no sector

#### Scenario: Date wins
- **WHEN** the switch is on and the user enters `Review this week plan friday`
- **THEN** the task is due Friday, titled `Review this week plan`, with no sector
