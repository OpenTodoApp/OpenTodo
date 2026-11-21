## MODIFIED Requirements

### Requirement: Sync status is quiet
Sync status SHALL be a dot in the sidebar footer, green when synced, animated while syncing, grey when offline and red on error, with the text ("Synced", "3 pending", "Offline") in its tooltip and announced to assistive technology. The text SHALL be visible beside the dot only while offline, on error, while changes are pending, or while the sync is stale. The sync SHALL count as stale when the dot would otherwise read synced or syncing but the last successful sync is more than 15 minutes old (or the page has been open for 15 minutes without one): the dot SHALL then be amber and read "Not synced since {time}" ("Not synced yet"), and a click SHALL sync now.

#### Scenario: Synced
- **WHEN** the device is online, live and has no pending changes
- **THEN** only the dot is shown, and hovering or focusing it reads "Synced · live updates connected"

#### Scenario: Pending offline
- **WHEN** the device is offline with two unsynced changes
- **THEN** the footer reads "Offline · 2 pending" beside the grey dot

#### Scenario: Data stopped arriving
- **WHEN** the device is online and its last successful sync was an hour ago without an error
- **THEN** the footer reads "Not synced since" with that time beside an amber dot, never "Synced"
