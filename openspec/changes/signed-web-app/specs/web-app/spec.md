## MODIFIED Requirements

### Requirement: Recovery after a server upgrade
An open tab SHALL recover when the server moves to a new release:
- When a lazily loaded part of the app is gone, it SHALL reload once on its own, and show a "Reload to update" prompt if the part is still missing right after.
- When a verified new version is installed, or a newer tab upgrades the local database, it SHALL show a "Reload to update" prompt.
- A tab whose database was upgraded elsewhere SHALL close its connection.
- The previous version's files SHALL stay available to open tabs until the next install.
- When an update is refused (signed-web-app), the tab SHALL show the refusal message without a reload prompt and keep working.

Offline, the installed release keeps working; local data is untouched.

#### Scenario: Old chunk after an upgrade
- **WHEN** the server was upgraded and an open tab opens a screen whose code chunk no longer exists
- **THEN** the tab reloads into the new release

#### Scenario: New service worker
- **WHEN** the service worker verified and installed a new release's files while a tab is open
- **THEN** the tab shows "A new version of OpenTodo is ready." with a "Reload to update" button

#### Scenario: Update refused
- **WHEN** the server offers an update that fails the signature check while a tab is open
- **THEN** the tab shows "This update wasn't signed by OpenTodo. It wasn't installed." without a reload button and keeps working
