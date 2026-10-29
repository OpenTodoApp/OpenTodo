## ADDED Requirements

### Requirement: The session handed to a native shell
While the web app runs in a shell that lists the `focus` capability (native-shells "The running Focus session outside the app"), it SHALL publish the session's state to the shell on every change: start, pause, resume, phase change, end, change of task, "Take a break" from the break reminder, and leaving the Focus screen. It SHALL also publish on start whenever a session is stored, and it SHALL publish that none runs on sign-out, on lock of an encrypted account, and when no session is stored. The published state SHALL carry the title only when the device's "include task titles" option is on and the account is not encrypted. Publishing writes no op and sends nothing to the server, and a browser or a shell without the capability SHALL see no change. The address `/focus?action=pause` or `/focus?action=resume` SHALL apply that control through the same transition as Space, then be removed from the address. When the session is already in the asked state, the address does nothing.

#### Scenario: Browser unchanged
- **WHEN** a session runs in a browser tab
- **THEN** nothing is published and the Focus screen behaves as before

#### Scenario: Pause from the address
- **WHEN** the shell opens `/focus?action=pause` while a work session runs
- **THEN** the session pauses, its time entry stops, the parameter is removed from the address, and the new paused state is published

#### Scenario: Stale action
- **WHEN** the shell opens `/focus?action=pause` and the session is already paused
- **THEN** nothing changes and no op is written

#### Scenario: Sign-out during a session
- **WHEN** the user signs out while a session runs in the iOS app
- **THEN** the web app publishes that none runs before clearing local data, and the Live Activity disappears

### Requirement: Session end notification inside a shell
In a shell that lists the `focus` capability, the session-end and break-end notifications SHALL come from the shell (native-shells "Session-end notification from the shell"), and the web app SHALL NOT attempt the service-worker notification, so at most one notification is shown per session end. In a browser the requirement "Session end notification" applies unchanged.

#### Scenario: One notification in the Android app
- **WHEN** a session ends while the Android app is in the background
- **THEN** exactly one "Session done" notification is shown, the shell's, and none from the web app

#### Scenario: Browser keeps the service worker notification
- **WHEN** a session ends while a browser tab is hidden and notifications are allowed
- **THEN** the service worker's notification is shown as before
