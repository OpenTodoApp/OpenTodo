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
A single request SHALL push the client's pending operations and pull operations recorded after the client's cursor, excluding those authored by the requesting device. The response SHALL include the new cursor, whether more operations remain, the server time, the list of pushed operations that were refused for authorization reasons (each with its id and a reason) and the caller's current project memberships. The client SHALL keep exchanging until the outbox is empty and no more operations remain, and SHALL treat every added response field as optional so older clients keep working.

#### Scenario: New device catches up
- **WHEN** a device with an empty cursor syncs
- **THEN** it receives every operation ever recorded for the user's own data and for every project shared with the user, including those created through the REST API, and ends with the same tasks and projects as the other devices

#### Scenario: Offline edits upload on reconnect
- **WHEN** a device made edits offline and the network returns
- **THEN** the pending operations are uploaded without user action and other devices receive them on their next exchange

#### Scenario: Newly shared project catches up behind an existing cursor
- **WHEN** a device whose cursor is already past a project's history becomes a member of that project and syncs
- **THEN** the exchange delivers that project's full history before newer operations, reporting that more remain until the history is complete, and the device's single cursor keeps advancing monotonically

#### Scenario: Refused operations do not block the outbox
- **WHEN** a pushed batch contains an operation the caller is not allowed to make
- **THEN** the response is 200, the allowed operations are applied, the refused one is listed with its id and reason, and the device removes it from the outbox instead of retrying it

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
Timestamps SHALL be strictly increasing per device even if the system clock moves backwards, and the server SHALL clamp timestamps more than five minutes in the future so a wrong clock cannot make a field unchangeable.

#### Scenario: Device clock far in the future
- **WHEN** a device with a clock one hour ahead syncs an edit
- **THEN** the stored timestamp is at most five minutes ahead of server time and later edits from correctly set devices can still win

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
The server SHALL cap concurrent streams per account; when the cap is exceeded it SHALL close the oldest stream for that account rather than refuse the new one, so a device that reconnects after a half-closed connection is never locked out. The cap SHALL be at least sixteen so several tabs and devices coexist.

#### Scenario: Stale connection replaced
- **WHEN** an account already has the maximum number of open streams and a device opens another
- **THEN** the new stream is accepted and the oldest one is closed; the closed client reconnects through its normal backoff

### Requirement: Works behind reverse proxies
The stream SHALL send a heartbeat at least every thirty seconds and SHALL set response headers that disable proxy buffering and caching, so it stays open behind common reverse proxies and NAT idle timeouts with no proxy-specific configuration in the default deployment. The service worker SHALL never intercept or cache the stream.

#### Scenario: Idle stream behind a proxy
- **WHEN** no operation is recorded for several minutes while a device is connected through the default compose deployment
- **THEN** the stream stays open and the next remote change still arrives within two seconds

#### Scenario: Installed app
- **WHEN** the installed PWA opens the stream
- **THEN** events are delivered live and never served from cache
