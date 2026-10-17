## ADDED Requirements

### Requirement: Bounded calendar data parsing
The server SHALL parse iCalendar data in time proportional to its size. A logical content line SHALL be at most 64 KB after unfolding, and a body SHALL hold at most eight physical lines per allowed content line; a body over either limit SHALL be refused as invalid calendar data before any write, so nothing changes on the server and the client keeps its local copy to retry or fix. The limits apply to CalDAV resources and to subscribed calendars alike.

#### Scenario: Continuation-line flood
- **WHEN** a client `PUT`s a 1 MB VTODO body made of one property folded into hundreds of thousands of continuation lines
- **THEN** the server refuses it as invalid calendar data within a fraction of a second and no task changes

#### Scenario: Long description
- **WHEN** a client `PUT`s a VTODO whose folded `DESCRIPTION` is 60 KB long
- **THEN** it is accepted and the task's notes hold the whole description

#### Scenario: Over-long line
- **WHEN** a body holds one content line longer than 64 KB after unfolding
- **THEN** the server refuses it as invalid calendar data
