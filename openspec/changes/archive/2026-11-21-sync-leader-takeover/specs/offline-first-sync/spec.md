## MODIFIED Requirements

### Requirement: One tab syncs
Of the tabs open in one browser, the client SHALL run the sync loop (exchanges, timer, live channel) in one tab only, chosen with a browser lock; the other tabs SHALL ask it to sync after their edits and on "Sync now", and SHALL show its status. When that tab closes or stops, another open tab SHALL take over. A tab waiting for the lock SHALL check about every 20 seconds that the tab holding it answers, and after two checks without an answer SHALL take the lock from it and run the sync loop itself; a tab that loses the lock this way SHALL stop its loop and wait for the lock again. Without such a lock every tab SHALL sync on its own. All tabs share one local database and outbox, so their edits converge as those of one device.

#### Scenario: Two tabs
- **WHEN** the app is open in two tabs and the user edits a task in the second one
- **THEN** only the first tab sends the sync request, and the second tab's indicator shows the result

#### Scenario: The syncing tab closes
- **WHEN** the tab that runs the sync loop is closed while another tab stays open
- **THEN** the remaining tab starts syncing on its own

#### Scenario: The syncing tab stops answering
- **WHEN** another client of the browser holds the lock and never answers, and the user edits a task in an open tab
- **THEN** within about a minute that tab takes the lock, sends the edit and pulls what other devices wrote
