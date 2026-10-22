# offline-first-sync Specification

## Purpose
Guarantees that the client works without a network, that every edit is captured as an operation, and that all of a user's devices converge on the same state after exchanging operations with the server.

## Requirements

### Requirement: Local store is the source of truth
The client SHALL keep a complete copy of the user's projects and tasks in browser storage and SHALL render every view from that copy. Edits SHALL be applied to the local copy before any network activity.

#### Scenario: Edit with no network
- **WHEN** the device is offline and the user creates, edits, completes or deletes tasks
- **THEN** every change is visible immediately and survives a page reload

#### Scenario: App loads offline
- **WHEN** the installed app is opened with no network after at least one successful sign-in
- **THEN** it opens to the user's tasks without an error page

### Requirement: Field-level operations
Every change SHALL be expressed as operations that each set one field of one entity and carry a unique id, a timestamp in milliseconds from a monotonic hybrid clock, and the id of the device that produced it. The server SHALL validate entity, field and value type against a published schema and SHALL reject a batch containing an invalid operation.

#### Scenario: Invalid operation in a batch
- **WHEN** a sync request contains an operation for an unknown field
- **THEN** the whole request is refused with a 400 `invalid_op` error and no operation from it is stored

### Requirement: Convergence by last-writer-wins per field
For each field, the value with the greatest timestamp SHALL win; equal timestamps SHALL be broken by comparing device ids. The same rule SHALL run on the server and on every client, so the resulting state depends only on the set of operations seen, not on their order of arrival.

#### Scenario: Concurrent edits of different fields
- **WHEN** device A changes a task's title offline while device B changes its priority offline, and both sync
- **THEN** both devices show the new title and the new priority

#### Scenario: Concurrent edits of the same field
- **WHEN** two devices change the same title offline and both sync
- **THEN** every device shows the title written with the greater timestamp, and the outcome is identical whichever device synced first

#### Scenario: Stale operation arrives late
- **WHEN** an operation older than the current value of a field is delivered after a newer one
- **THEN** the field keeps the newer value

### Requirement: Idempotent delivery
The server SHALL ignore an operation whose id it has already stored, and the client SHALL apply the same operation twice without changing state, so retries after a lost response are safe.

#### Scenario: Retry after lost response
- **WHEN** a client resends a batch because it never received the response
- **THEN** the server reports them as duplicates and the state is identical to a single delivery

### Requirement: Sync exchange
A single request SHALL push the client's pending operations and pull operations recorded after the client's cursor, excluding those authored by the requesting device. The response SHALL include the new cursor, whether more remain, the server time, the refused operations with reasons, the caller's project memberships, and the caller's workspaces with their members and groups. The client SHALL exchange until the outbox is empty and nothing remains, treating added response fields as optional, and SHALL replace its cached workspace directory with the response's on every exchange.

#### Scenario: New device catches up
- **WHEN** a device with an empty cursor syncs
- **THEN** it receives every operation ever recorded for the user's own data and for every project shared with the user, including those created through the REST API, and ends with the same tasks and projects as the other devices, partitioned into the same workspaces

#### Scenario: Offline edits upload on reconnect
- **WHEN** a device made edits offline and the network returns
- **THEN** the pending operations are uploaded without user action and other devices receive them on their next exchange

#### Scenario: Newly shared project catches up behind an existing cursor
- **WHEN** a device whose cursor is already past a project's history becomes a member of that project and syncs
- **THEN** the exchange delivers that project's full history before newer operations, reporting that more remain until the history is complete, and the device's single cursor keeps advancing monotonically

#### Scenario: Refused operations do not block the outbox
- **WHEN** a pushed batch contains an operation the caller is not allowed to make
- **THEN** the response is 200, the allowed operations are applied, the refused one is listed with its id and reason, and the device removes it from the outbox instead of retrying it

#### Scenario: Workspace directory in the response
- **WHEN** a member of "Family" syncs after a group there gained a member
- **THEN** the response's workspaces carry Family with the new group member, the device replaces its cached copy, and a client from before this change ignores the field and syncs as before

#### Scenario: Left a workspace
- **WHEN** a device of a user who was removed from "Family" syncs
- **THEN** the response no longer lists Family, the device drops it from its cache and switcher, and the projects of Family the user had through grants are purged as for a removed project member

### Requirement: Sync triggers and status
The client SHALL sync shortly after each local edit, when the network comes back, when the tab becomes visible, when the server signals that new operations are available, and periodically while open. It SHALL show whether it is synced, syncing, offline (with the count of pending changes), signed out, or in error, SHALL show whether live updates are connected, and SHALL let the user trigger a sync manually.

#### Scenario: Status while offline
- **WHEN** the device is offline with unsent edits
- **THEN** the indicator shows offline with the number of pending changes

#### Scenario: Remote change arrives promptly
- **WHEN** device A is signed in with live updates connected and device B (or an API client) records an operation for the same user
- **THEN** device A runs a sync exchange within two seconds without user action and shows the change

#### Scenario: Live state visible in the indicator
- **WHEN** the live channel is connected, and later when it is disconnected
- **THEN** the indicator distinguishes the two states, and in the disconnected state syncing still happens on the periodic timer

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

### Requirement: Per-user isolation
Operations SHALL be stored and served per scope: a user's personal scope holds their Inbox, unshared projects and the tasks in them, and each shared project is its own scope. A user SHALL receive operations only from their personal scope and from the scopes of projects they are currently a member of, and SHALL be able to affect only those scopes, within their role. No user SHALL receive or affect any other scope.

#### Scenario: Two accounts on one server
- **WHEN** two users who share nothing sync against the same server
- **THEN** each receives only their own operations

#### Scenario: Shared and personal data side by side
- **WHEN** Alice and Bob share one project and each also has personal projects, and both sync
- **THEN** each receives the shared project's operations plus their own, and neither receives anything from the other's personal projects

#### Scenario: Former member
- **WHEN** Bob has been removed from a shared project and syncs
- **THEN** he receives no further operations of that project, and operations he submits for it are refused

### Requirement: Live update channel
The server SHALL offer an authenticated, long-lived event stream per device at `GET /api/v1/sync/events` that accepts the same session cookie or bearer token as every other API route and emits a wake-up event whenever operations for the authenticated user are recorded. The stream SHALL carry no stored data of its own: if it is unavailable or offline, nothing is lost, because every change is still delivered by the sync exchange and convergence is unchanged.

#### Scenario: Authenticated subscription
- **WHEN** a signed-in device opens the stream and another device later records operations for the same user
- **THEN** the stream stays open and delivers a wake-up event for those operations

#### Scenario: Unauthenticated request
- **WHEN** a request to the stream carries no valid session or token
- **THEN** the response is 401 with the error envelope and code `unauthorized`, and no stream is opened

#### Scenario: Missing device identifier
- **WHEN** a request to the stream omits the device identifier
- **THEN** the response is 400 with the error envelope and code `bad_request`

### Requirement: Wake-up carries no operation content
A wake-up event SHALL contain at most the server's latest operation cursor; it SHALL never include operation values, field names, entity ids or any task or project content. The client SHALL obtain changes only through the sync exchange after a wake-up. This keeps the stream safe to log and proxy and keeps the op log the single source of truth both online and offline.

#### Scenario: Inspecting the stream
- **WHEN** a wake-up event is captured on the wire
- **THEN** it contains no entity id, field name or value, and the client's local store changes only after the following sync exchange

#### Scenario: Cursor already reached
- **WHEN** a wake-up names a cursor the device has already stored
- **THEN** the device skips the exchange

### Requirement: Originating device is not woken
Operations recorded by a device SHALL NOT produce a wake-up on that same device's stream, while operations recorded through the REST API or by any other device SHALL wake every other connected device of the user. Offline devices simply receive nothing and catch up on reconnect; convergence does not depend on wake-ups.

#### Scenario: Own edit
- **WHEN** a device pushes its own operations in a sync exchange
- **THEN** that device receives no wake-up for them and does not start another exchange

#### Scenario: API write
- **WHEN** a script creates a task through the REST API
- **THEN** every connected device of that user receives a wake-up

### Requirement: Channel lifecycle and reconnection
The client SHALL open the channel after sign-in and close it on sign-out. When the stream drops, the client SHALL reconnect with exponential backoff starting near one second, capped at thirty seconds, with jitter, and SHALL run a sync exchange immediately after every successful (re)connection so events missed while disconnected are covered. While offline the client SHALL not attempt to connect; it resumes when the network returns.

#### Scenario: Server restart
- **WHEN** the server restarts while a device has the stream open
- **THEN** the device reconnects within the backoff window without user action, syncs once on reconnect, and the indicator returns to the connected state

#### Scenario: Edit made during the outage
- **WHEN** another device records an operation while this device's stream is down, and the stream later reconnects
- **THEN** the operation is received in the exchange that follows the reconnection

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** the stream is closed and no reconnection is attempted until the next sign-in

### Requirement: Polling remains the fallback
Periodic syncing SHALL continue whenever the channel is not connected, at the existing interval. While the channel is connected the client MAY lengthen the periodic interval, but SHALL still sync at least every five minutes, so a missed event can never leave devices divergent for long. A client that never opens the channel SHALL keep working exactly as before.

#### Scenario: Stream blocked by the network
- **WHEN** a proxy or firewall closes the stream immediately on every attempt
- **THEN** the device still receives remote changes through the periodic exchange and the indicator shows live updates as disconnected

#### Scenario: Missed wake-up
- **WHEN** a wake-up is lost while the stream appears connected
- **THEN** the change is still received within five minutes

### Requirement: Channel isolation per account
A stream SHALL deliver wake-ups only for the account that authenticated it. Operations of one user SHALL never wake, and SHALL never be observable through, another user's stream, and streams SHALL be closed when the session or token that opened them is revoked or expires.

#### Scenario: Two accounts on one server
- **WHEN** user A and user B both hold open streams and user B records an operation
- **THEN** only user B's other devices receive a wake-up

#### Scenario: Session revoked while connected
- **WHEN** the session that opened a stream is ended by sign-out elsewhere
- **THEN** the stream is closed within one heartbeat interval and reconnection attempts are refused with 401

### Requirement: Connection limits
The server SHALL cap concurrent streams per account; when the cap is exceeded it SHALL close the oldest stream for that account rather than refuse the new one, so a device that reconnects after a half-closed connection is never locked out. The cap SHALL be ten, so several tabs and devices coexist while one account (such as a demo sandbox) cannot hold more. The server SHALL also hold at most 20 streams per client address and 2,000 in all; a stream over either cap SHALL be refused with 503 `busy` and `Retry-After`, and the client keeps converging through its backoff and polling, since the stream carries no data.

#### Scenario: Stale connection replaced
- **WHEN** an account already has the maximum number of open streams and a device opens another
- **THEN** the new stream is accepted and the oldest one is closed; the closed client reconnects through its normal backoff

#### Scenario: Too many streams from one address
- **WHEN** one client address already holds 20 open streams, across any accounts, and opens another
- **THEN** the new stream is refused with 503 `busy` and `Retry-After`, while a client at another address can still connect

#### Scenario: Server-wide cap
- **WHEN** the server already holds its maximum number of streams and a device opens another
- **THEN** the stream is refused with 503 `busy`; once a stream closes, a new one is accepted

### Requirement: Works behind reverse proxies
The stream SHALL send a heartbeat at least every thirty seconds and SHALL set response headers that disable proxy buffering and caching, so it stays open behind common reverse proxies and NAT idle timeouts with no proxy-specific configuration in the default deployment. The service worker SHALL never intercept or cache the stream.

#### Scenario: Idle stream behind a proxy
- **WHEN** no operation is recorded for several minutes while a device is connected through the default compose deployment
- **THEN** the stream stays open and the next remote change still arrives within two seconds

#### Scenario: Installed app
- **WHEN** the installed PWA opens the stream
- **THEN** events are delivered live and never served from cache

### Requirement: Bounded pull pages
A pull page, including the history replay for a newly joined project, SHALL hold at most 1000 operations and SHALL end before the operation that would bring the summed size of served values above about 4 MB, reporting that more remain. A page SHALL carry at least one operation when any remain, so devices always progress. The response format SHALL not change; operations arrive in order and once, so convergence is unaffected.

#### Scenario: Many large notes
- **WHEN** a device pulls after another device saved twenty notes of 256 KB each
- **THEN** the first response carries at most about 4 MB of values and reports that more remain, and repeating the exchange delivers every operation exactly once

#### Scenario: Oversized operation
- **WHEN** the next operation alone is larger than the budget
- **THEN** the response carries that single operation, the cursor moves past it and the device continues

#### Scenario: Replay of a newly shared project
- **WHEN** a device joins a project whose history is larger than the budget
- **THEN** the history arrives in several pages with the cursor unchanged and more reported until it is complete

#### Scenario: Offline device reconnects
- **WHEN** a device that was offline for weeks reconnects
- **THEN** it pulls in bounded pages until nothing remains and ends with the same data as other devices

### Requirement: Notification actions share the device clock
Changes written outside the open app on the device, such as Snooze and Dismiss on a reminder notification, SHALL be stamped with the same corrected clock as the app's own edits. When such a change is uploaded without the app and is refused, or the answer is not the server's, it SHALL stay queued for the app's next sync. Offline, it is applied and queued as any other edit; convergence follows last-writer-wins.

#### Scenario: Device clock an hour slow
- **WHEN** the app has found the device clock an hour behind the server and the user snoozes a reminder from its notification with the app closed
- **THEN** the change is stamped about an hour later than the device clock reads, after the device's last stamp, like an edit made in the app

#### Scenario: Refused upload
- **WHEN** the notification action uploads its change itself and the server refuses one of its operations as stamped too far ahead
- **THEN** that operation stays queued on the device, the accepted ones leave the queue, and the app's next sync stamps it again and sends it

#### Scenario: Answer from a proxy
- **WHEN** the upload is answered with a page that is not a sync response
- **THEN** every operation of the change stays queued on the device

#### Scenario: Offline
- **WHEN** the user dismisses a reminder from its notification while the device is offline
- **THEN** the reminder is dismissed on the device and the change waits in the queue for the next sync

### Requirement: Convergence is verified under random histories
The test suite SHALL include a seeded property test of convergence: devices of more than one account with clocks from minutes slow to hours fast make random edits, exchange in random order and page sizes, and a project is shared part way through. After every device has exchanged its queued (offline) edits, every device SHALL hold the server's value and clock for each field it can see, and the server's state SHALL equal a last-writer-wins replay of its op log.

#### Scenario: Random history converges
- **WHEN** the property test runs with any seed
- **THEN** after the final exchanges every replica, the server and the replay of the op log agree on every field

#### Scenario: A failure can be replayed
- **WHEN** a run fails
- **THEN** its log names the seed, and running the test with that seed reproduces the same history

### Requirement: Op schema contract shared by server and client
One fixture file SHALL list, per entity, the op fields the server accepts, the field name prefixes, and the content fields an encrypted account encrypts. The server's test suite SHALL fail when its schema or content field list differs from the fixture, and the web client's test suite SHALL fail when its entities, row defaults or content field list differ from it, so a field cannot be added on one side only. Every content field SHALL be a schema field.

#### Scenario: Field added on the server only
- **WHEN** a field is added to the server schema but not to the fixture and the client's row defaults
- **THEN** the server's schema fixture test fails and names the difference

#### Scenario: Content field missing on the client
- **WHEN** a field is encrypted by the server's list but missing from the client's content fields
- **THEN** the client's schema fixture test fails

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

### Requirement: Entity id characters
An op's `entityId` SHALL be 1 to 64 characters from ASCII letters, digits and `.` `_` `:` `@` `+` `=` `~` `-`. The server SHALL refuse a batch containing any other id as an invalid op (400 `invalid_op` on sync, nothing stored), so a stored id can always be written into JSON and URLs. Every id the clients generate (UUIDs, name-derived UUIDs, `me`, CalDAV UIDs) SHALL stay valid, so offline devices keep converging. The server SHALL write ids into JSON with standard JSON string quoting.

#### Scenario: Control character refused
- **WHEN** a device pushes an op for task id `x\u0007`
- **THEN** the batch is refused as invalid, nothing is stored, and every member's task list still loads

#### Scenario: Client ids accepted
- **WHEN** a device pushes ops for a UUID, a CalDAV UID such as `20261017T101500Z-1234@example.com`, or the preferences row `me`
- **THEN** the ops are applied as before

### Requirement: Sign-out stops the running exchange
When the user signs out or sync stops, the client SHALL abort the sync request in flight, SHALL stop a running exchange before its next write, and SHALL wait for it before clearing the local data. Nothing sent for the previous session SHALL be stored afterwards, and the next account SHALL get a new device id. Queued edits go with the local data, as on any sign-out; the next account converges from an empty database.

#### Scenario: Sign-out while the server is answering
- **WHEN** a sync request is waiting for the server and the user signs out, and the server's answer with operations and a new cursor arrives afterwards
- **THEN** the request is aborted, none of those operations and no cursor are stored, and the cleared database stays empty

#### Scenario: New device id after sign-out
- **WHEN** the user signs out and another account signs in on the same browser
- **THEN** the first exchange of the new account uses a device id stored in the new local data, not the previous one

### Requirement: Requests have a deadline
Every request the client makes to the server SHALL have a timeout: 30 seconds for ordinary requests and 10 minutes for file and archive uploads and downloads. A request that times out SHALL count as no answer: the sync status shows offline, the outbox stays queued for offline use, the exchange is tried again with backoff (1 second doubling to 30 seconds), and a later exchange runs normally. Convergence follows from the server ignoring op ids it already holds.

#### Scenario: Hung sync request
- **WHEN** the server accepts the sync request but never answers
- **THEN** after the timeout the status shows offline, the edits stay queued, and the next exchange is sent and completes

#### Scenario: Retry after a network failure
- **WHEN** an exchange fails because the network is unreachable
- **THEN** the status shows offline and the exchange is tried again about one second later without user action

### Requirement: Offline means no answer from the server
The client SHALL show the offline state only when the browser reports no network, a request failed in the network, or a request timed out. Any other failure during an exchange, including an error in the client's own code, SHALL show the error state with its message; queued edits stay on the device in both cases.

#### Scenario: Client error during an exchange
- **WHEN** an exchange fails because of a programming error in the client while the network is up
- **THEN** the status shows an error with the message instead of offline

### Requirement: One tab syncs
Of the tabs open in one browser, the client SHALL run the sync loop (exchanges, timer, live channel) in one tab only, chosen with a browser lock; the other tabs SHALL ask it to sync after their edits and on "Sync now", and SHALL show its status. When that tab closes or stops, another open tab SHALL take over. Without such a lock every tab SHALL sync on its own. All tabs share one local database and outbox, so their edits converge as those of one device.

#### Scenario: Two tabs
- **WHEN** the app is open in two tabs and the user edits a task in the second one
- **THEN** only the first tab sends the sync request, and the second tab's indicator shows the result

#### Scenario: The syncing tab closes
- **WHEN** the tab that runs the sync loop is closed while another tab stays open
- **THEN** the remaining tab starts syncing on its own

### Requirement: Sign-out reaches every tab
A sign-out in one tab SHALL make the other open tabs reload, and the local data SHALL be cleared only while no tab is syncing, so no tab writes the previous account's data into the cleared database.

#### Scenario: Sign-out with two tabs open
- **WHEN** the user signs out in one tab while another tab is syncing
- **THEN** the other tab reloads to the sign-in screen and the local data is cleared after its exchange stopped

### Requirement: Held changes are kept atomically
Changes a server limit refused SHALL be held and offered again in local transactions that read and write the held list together, so a change held while others are being offered again is neither lost nor queued twice. Offline, held changes stay on the device; they converge like any other change once the limit allows them.

#### Scenario: Hold during a requeue
- **WHEN** held changes are moved back to the outbox at the moment another change is held
- **THEN** every change is either queued once or still held afterwards

### Requirement: Malformed sync answers leave the device unchanged
The client SHALL check that a sync answer has the shape of a sync response before it removes anything from the outbox or applies anything. An answer that does not (for example a page served by a proxy or captive portal with a success status) SHALL leave the outbox, the cursor and the local data unchanged and SHALL show a sync error; the queued changes SHALL be sent again on the next exchange, and convergence SHALL follow from the server ignoring op ids it already holds.

#### Scenario: Proxy page with status 200
- **WHEN** the device has an offline edit queued and the sync request is answered with status 200 and an HTML page
- **THEN** the edit stays queued, the cursor is unchanged, the status shows an error, and the next successful exchange uploads the edit

### Requirement: Refusals are handled before an exchange can stop
When a sync answer is accepted, the client SHALL remove the sent batch from the outbox in the same local transaction that keeps the changes a server limit refused and forgets the local clocks of refused changes, before any later step can end the exchange. When the exchange then stops because the device holds no key for an encrypting account, the cursor SHALL stay unchanged, so the server's values arrive after unlocking and win; held changes SHALL stay on the device and be offered again later.

#### Scenario: Locked answer with a limit refusal
- **WHEN** a device sends two edits, the server refuses one for a storage limit and one as forbidden, and its answer shows that encryption was turned on elsewhere while this device has no key
- **THEN** the device shows the locked state, keeps the limited edit as held, counts it as pending, and no longer treats the forbidden edit as the newest value

### Requirement: Every entity kind is re-seeded and handled when refused
The client SHALL map every synced entity kind to its local table in one place that has no default table. Re-seeding after a server restore SHALL send every synced entity kind, custom field definitions included, with their original clocks so devices converge as by the normal rule. A refused change to any entity kind SHALL have its local clock forgotten, and a row of any kind that existed only on this device and was refused SHALL be removed without failing the exchange.

#### Scenario: Custom field definitions after a restore
- **WHEN** the server is restored from a backup and the device holds a custom field definition
- **THEN** the re-seed sends the definition's fields with their original timestamps and devices

#### Scenario: Refused custom field change
- **WHEN** the server refuses an offline rename of a custom field definition and sends its own value
- **THEN** the definition shows the server's name, and a definition that only existed on this device is removed

#### Scenario: Refused link attachment
- **WHEN** the server refuses a link attachment this device created offline
- **THEN** the exchange completes without an error, the attachment is removed locally and the user is told a change was not accepted
