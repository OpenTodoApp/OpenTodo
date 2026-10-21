## MODIFIED Requirements

### Requirement: Audit surfaces in Settings
Settings SHALL show the owner an Audit log card and every user a Recent activity card. The Audit log card SHALL show its events as a compact list, newest first, one line per event: an icon for the kind, the event in words ("Signed in", "Token created", "Sign-in failed"), the account, the time (relative today, then the date), and the client in muted text; details open in place when the line is activated. Its filters (event, account, outcome, period) SHALL sit in one row from 768 px and behind a "Filters" disclosure below it, with the active filters named as removable chips, and Export SHALL be an action in the card header that downloads with the current filters. The retention and address-logging settings SHALL be their own "Audit settings" card under it. The Recent activity card SHALL group events by day ("Today", "Yesterday", then the date), one line each (what, the browser and system, the time), SHALL fold repeated sign-ins from the same browser on the same day into one line with a count, SHALL show at most ten lines with "Show all" for the rest of the 90 days, and SHALL name a failed or unusual event in the warning tone. Both SHALL be keyboard reachable, SHALL show an offline notice instead of stale data when the network is unavailable, and SHALL keep nothing in browser storage.

#### Scenario: Owner filters and exports
- **WHEN** the owner filters by `login.failed` in the last day and chooses export
- **THEN** the table shows only those events and the download carries the same filter

#### Scenario: Offline panel
- **WHEN** either panel is opened without a network connection
- **THEN** it shows that the log needs a connection and displays no events

#### Scenario: Compact recent activity
- **WHEN** a user signed in four times today from the same Chrome on Linux and created a token yesterday
- **THEN** Recent activity shows "Today: Signed in ×4 · Chrome on Linux" and "Yesterday: Token created", each on one line

#### Scenario: Filters on a phone
- **WHEN** the owner opens the Audit log at 390 px and filters by "Sign-in failed"
- **THEN** the filters sit behind "Filters", the active filter shows as a chip that removes it, and the list shows only failed sign-ins

## ADDED Requirements

### Requirement: Profile events
Changing one's name, requesting and confirming an email change, and setting or removing a profile picture SHALL be recorded as `account.name_changed`, `account.email_change_requested`, `account.email_changed` and `account.avatar_changed`, naming the account and the device's client, never the old or new name, email or picture. They SHALL appear in the user's Recent activity and the owner's audit log like other account events.

#### Scenario: Email change recorded
- **WHEN** a user confirms a new email address
- **THEN** the audit log holds `account.email_change_requested` and `account.email_changed` for that account, and neither event contains either address
