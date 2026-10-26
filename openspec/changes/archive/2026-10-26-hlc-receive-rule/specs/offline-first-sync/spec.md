## MODIFIED Requirements

### Requirement: Clock safety
Timestamps SHALL be strictly increasing per device even if the system clock moves backwards. An operation stamped more than five minutes ahead of the server's clock SHALL NOT be stored with that timestamp, so a wrong clock cannot make a field unchangeable: a device that announces the `clock_skew` feature SHALL get it refused with reason `clock_skew` and the server's time, SHALL correct its clock and SHALL send the same change again with a new timestamp, so the edit is kept; for a device that does not announce it, the server SHALL clamp the timestamp to five minutes ahead of its clock. The client SHALL follow the server's clock while the skew exceeds two seconds, SHALL drop its correction once its clock is right again, and SHALL bring a stored clock seed more than five minutes ahead of the server back to server time. Every operation a device or the `ot vault` receives SHALL move its clock to at least that operation's timestamp, and the stored seed with it, so its next change is stamped after every value it has seen even when its clock runs behind the writer's.

#### Scenario: Device clock far in the future
- **WHEN** a device with a clock one hour ahead syncs an edit
- **THEN** the stored timestamp is at most five minutes ahead of server time and later edits from correctly set devices can still win

#### Scenario: Fast device converges
- **WHEN** a device whose clock runs one hour fast edits a task title, syncs, and a correctly set device edits the same title a minute later
- **THEN** the first device's edit is stored after its clock was corrected, the later edit wins on the server and on both devices, and the first device's next edit still wins

#### Scenario: Older client keeps clamping
- **WHEN** a client that does not announce the `clock_skew` feature sends an op stamped an hour ahead
- **THEN** the op is stored with a timestamp five minutes ahead of server time and is not reported as refused

#### Scenario: Slow device edits after receiving a newer value
- **WHEN** a device whose clock runs a second behind receives a title another device stamped by its own clock, and then edits the title
- **THEN** its edit is stamped after the received one and wins on the server and on both devices

#### Scenario: Encrypt-on-sight beats the plaintext it replaces
- **WHEN** an encrypted account's device receives a plaintext value stamped a second ahead of its clock and re-encrypts it on sight
- **THEN** the encrypted rewrite is stamped after the plaintext op and is the server's current value

### Requirement: One server clock
Every operation the server writes itself (REST and assistant writes, CalDAV, public links, reminder deliveries, imports, email, unassignments) SHALL take its timestamp from one strictly increasing clock per server process, and SHALL carry the device `server:<boot id>`, chosen at process start. The bare device `server` of operations stored by older releases SHALL keep being treated as the server's. Every stored operation SHALL move that clock to at least its timestamp, and the clock SHALL start from the newest stored operations when the process starts, so a server write after a device operation stamped ahead of the server's clock is stamped after it.

#### Scenario: Two server writers in one millisecond
- **WHEN** a REST write and a reminder delivery write within the same millisecond
- **THEN** they carry different timestamps, so neither is dropped as a tie

#### Scenario: Server device stays reserved
- **WHEN** a device sends ops with device `server` or `server:abc` to `/api/v1/sync`
- **THEN** the request is refused with 400 `invalid_op`

#### Scenario: Server write after a device op stamped ahead
- **WHEN** a device's op is stored with a timestamp a minute ahead of the server's clock, and a REST write then changes the same field
- **THEN** the REST write is stamped after the device op and wins
