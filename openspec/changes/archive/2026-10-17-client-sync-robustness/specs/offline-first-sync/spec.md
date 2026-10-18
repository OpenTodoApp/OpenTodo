# Spec Delta

## ADDED Requirements

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
