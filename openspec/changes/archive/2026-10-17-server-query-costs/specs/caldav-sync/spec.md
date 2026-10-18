## ADDED Requirements

### Requirement: CalDAV lookups do not scan the account
A CalDAV request SHALL load the user's view once and index it, so that finding a resource by name, a task by UID or a calendar's members does not scan every task. Responses SHALL stay the same. CalDAV writes still go through ops; nothing changes for offline devices or convergence.

#### Scenario: Multiget on a large account
- **WHEN** a client sends a calendar-multiget of 200 hrefs for an account of 2,000 tasks
- **THEN** each href costs a lookup, not a scan of the account, and the response lists the same resources and ETags as before

#### Scenario: Unauthenticated request
- **WHEN** a REPORT arrives without valid app-password credentials
- **THEN** the response is 401 and no view is loaded

### Requirement: Calendar queries encode each task once
A calendar-query SHALL encode each task once. For the plain filter that selects every task (VCALENDAR containing VTODO, no further conditions) it SHALL not parse the encoded data again; any other filter SHALL be evaluated on the calendar data the client would receive. The plain filter also returns a task whose calendar data would not parse back, as PROPFIND and sync-collection already do. The query only reads; devices are unaffected.

#### Scenario: Plain filter
- **WHEN** a client sends a calendar-query with only `comp-filter VCALENDAR` and `comp-filter VTODO`
- **THEN** every task of the calendar is returned without its data being parsed again

#### Scenario: Time-range query
- **WHEN** a client sends a calendar-query with a VTODO time-range
- **THEN** only the tasks whose calendar data falls in the range are returned, as before
