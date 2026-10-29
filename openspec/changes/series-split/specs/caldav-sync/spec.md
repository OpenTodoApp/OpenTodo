## ADDED Requirements

### Requirement: Split series in CalDAV
A piece of a split series (OpenSpec `recurring-tasks`, "Pieces of one lineage") SHALL be served as its own recurring VTODO with its own UID, its rule as RRULE, its current occurrence as DTSTART and DUE, and `RELATED-TO;RELTYPE=SIBLING` naming the previous piece's UID; the series it continues SHALL be served with the `UNTIL` of its rule. A client that ends a series and creates a new object for its own "this and future" edit SHALL be read as a rule change on the existing task and a new task, without a lineage link. Changes through CalDAV are written through the op log like every CalDAV write.

#### Scenario: Piece fetched by a client
- **WHEN** "Study" `every weekday` due 2026-10-12 at 18:00 was split from 2026-10-14 to 19:00 and a client syncs
- **THEN** the client receives the old object with `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261013` and a new object due 2026-10-14 at 19:00 with `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` and `RELATED-TO;RELTYPE=SIBLING` naming the old UID

#### Scenario: A client's own this-and-future edit
- **WHEN** a client rewrites a series' RRULE with an `UNTIL` and PUTs a new recurring object for the following dates
- **THEN** the existing task's rule gains that `until`, a new recurring task is created from the new object, and neither carries `split_from`
