# Spec Delta

## MODIFIED Requirements

### Requirement: Sync triggers and status
The client SHALL sync shortly after each local edit, when the network comes back, when the tab becomes visible, when the server signals that new operations are available, and periodically while open. It SHALL show whether it is synced, syncing, offline (with the count of pending changes), signed out, or in error, SHALL show whether live updates are connected, and SHALL let the user trigger a sync manually. Offline, the indicator reflects pending changes exactly as before; convergence rules are unchanged.

#### Scenario: Status while offline
- **WHEN** the device is offline with unsent edits
- **THEN** the indicator shows offline with the number of pending changes

#### Scenario: Remote change arrives promptly
- **WHEN** device A is signed in with live updates connected and device B (or an API client) records an operation for the same user
- **THEN** device A runs a sync exchange within two seconds without user action and shows the change

#### Scenario: Live state visible in the indicator
- **WHEN** the live channel is connected, and later when it is disconnected
- **THEN** the indicator distinguishes the two states, and in the disconnected state syncing still happens on the periodic timer

## ADDED Requirements

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
