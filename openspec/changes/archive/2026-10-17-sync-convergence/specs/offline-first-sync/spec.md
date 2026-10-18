## MODIFIED Requirements

### Requirement: Clock safety
Timestamps SHALL be strictly increasing per device even if the system clock moves backwards. An operation stamped more than five minutes ahead of the server's clock SHALL NOT be stored with that timestamp, so a wrong clock cannot make a field unchangeable: a device that announces the `clock_skew` feature SHALL get it refused with reason `clock_skew` and the server's time, SHALL correct its clock and SHALL send the same change again with a new timestamp, so the edit is kept; for a device that does not announce it, the server SHALL clamp the timestamp to five minutes ahead of its clock. The client SHALL follow the server's clock while the skew exceeds two seconds, SHALL drop its correction once its clock is right again, and SHALL bring a stored clock seed more than five minutes ahead of the server back to server time.

#### Scenario: Device clock far in the future
- **WHEN** a device with a clock one hour ahead syncs an edit
- **THEN** the stored timestamp is at most five minutes ahead of server time and later edits from correctly set devices can still win

#### Scenario: Fast device converges
- **WHEN** a device whose clock runs one hour fast edits a task title, syncs, and a correctly set device edits the same title a minute later
- **THEN** the first device's edit is stored after its clock was corrected, the later edit wins on the server and on both devices, and the first device's next edit still wins

#### Scenario: Older client keeps clamping
- **WHEN** a client that does not announce the `clock_skew` feature sends an op stamped an hour ahead
- **THEN** the op is stored with a timestamp five minutes ahead of server time and is not reported as refused

## ADDED Requirements

### Requirement: One server clock
Every operation the server writes itself (REST and assistant writes, CalDAV, public links, reminder deliveries, imports, email, unassignments) SHALL take its timestamp from one strictly increasing clock per server process, and SHALL carry the device `server:<boot id>`, chosen at process start. The bare device `server` of operations stored by older releases SHALL keep being treated as the server's.

#### Scenario: Two server writers in one millisecond
- **WHEN** a REST write and a reminder delivery write within the same millisecond
- **THEN** they carry different timestamps, so neither is dropped as a tie

#### Scenario: Server device stays reserved
- **WHEN** a device sends ops with device `server` or `server:abc` to `/api/v1/sync`
- **THEN** the request is refused with 400 `invalid_op`

### Requirement: Post-commit effects survive a disconnect
Once a batch has committed, the server SHALL deliver its effects (webhook queueing, assignment, mention and unblocked notifications) even when the client that sent it disconnected and its request was cancelled.

#### Scenario: Client goes away after commit
- **WHEN** a device's request is cancelled right after its batch assigning a task committed
- **THEN** the assignee's notification is still recorded with the task's title

### Requirement: Due values are real dates and times
A task's `due` SHALL name a date that exists and, when it has a time, a clock time from 00:00 to 23:59; other values SHALL be refused.

#### Scenario: Impossible due date
- **WHEN** a device sends `due` `{"date":"2026-02-31"}` or `{"date":"2026-05-01","time":"24:00"}`
- **THEN** the batch is refused with 400 `invalid_op` and nothing in it is stored
