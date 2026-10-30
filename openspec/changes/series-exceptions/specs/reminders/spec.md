## ADDED Requirements

### Requirement: Reminders of a single occurrence
When an occurrence of a recurring task is written as an open record (moved, edited or detached alone, OpenSpec `recurring-tasks`), the same batch SHALL copy each relative reminder of the series onto the record, with an id derived from the record id and the series reminder's id, and a firing time computed from the record's own due. Absolute and deadline reminders SHALL NOT be copied. The series' reminders SHALL keep following the series. Because the ids are derived, devices that materialise the same occurrence offline SHALL converge on one copy of each reminder.

#### Scenario: Moved session keeps its reminder
- **WHEN** "Study" at 18:00 has a "15 minutes before" reminder and the user moves Wednesday's occurrence to 19:00
- **THEN** Wednesday's occurrence reminds at 18:45, and the series still reminds 15 minutes before its own due

#### Scenario: Two devices offline
- **WHEN** two devices move the same occurrence offline and sync
- **THEN** the occurrence has one copy of each relative reminder, firing from the due written with the greater timestamp

#### Scenario: Absolute reminder stays on the series
- **WHEN** the series has an absolute reminder on 20 October at 09:00 and Wednesday's occurrence is moved
- **THEN** the occurrence gets no copy of it
