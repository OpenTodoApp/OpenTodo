## ADDED Requirements

### Requirement: A revoked device removes its local copy
When sessions are ended by **Sign out everywhere**, by deactivating the account or by deleting it, the server SHALL keep, for a year, a record of each ended session that holds only its token hash and its wipe key. `GET /api/v1/auth/status` SHALL return `wipeKey` (a per-session random key) to a signed-in cookie session, and SHALL answer the cookie of a recorded session with `authenticated: false` and `revoked: {proof}`, the HMAC-SHA256 of `opentodo device revoked v1` under that session's key. An expired session, and sessions ended by a password change, a password reset or the device's own sign-out, SHALL get no proof. The web app SHALL keep the key in its local database and, only when a proof matches it, SHALL remove everything sign-out removes (the local database with the outbox and the stored encryption key, the native shell's reminders, geofences, widget and biometric key, and the HTTP cache), end the cookie and show the sign-in screen with "This device was signed out and its data was removed." Device relay opt-ins of the ended sessions SHALL end with them. Unsynced changes on the device are lost. The wipe happens on the device's next contact with the server; a device that never connects again keeps its copy. The wipe removes only a local copy: the server's data and the other devices' convergence are unaffected.

#### Scenario: Signed out everywhere from another device
- **WHEN** a person signs out everywhere on their laptop and later opens the app on their phone
- **THEN** the phone's `auth/status` carries a proof that matches its key, the phone removes its local copy and outbox, and shows the sign-in screen with "This device was signed out and its data was removed."

#### Scenario: Account deactivated
- **WHEN** an admin deactivates an account and one of its devices next contacts the server
- **THEN** that device removes its local copy in the same way, and the account's data stays on the server

#### Scenario: Expired session keeps its data
- **WHEN** a device's session expired, or was ended by a password change elsewhere
- **THEN** `auth/status` carries no proof, the sign-in screen appears and the local copy and outbox stay, uploading after the next sign-in

#### Scenario: Forged answer
- **WHEN** an answer claims `revoked` with a proof that does not match the key the device stored, or the device has no stored key
- **THEN** nothing is removed

#### Scenario: Another account's sessions
- **WHEN** one account signs out everywhere
- **THEN** no session of another account is recorded, and those devices keep working

#### Scenario: Relay opt-ins end with the sessions
- **WHEN** a device opted in to the device relay and its account signs out everywhere
- **THEN** the opt-in is removed and its relay stream closes

#### Scenario: Device that stays offline
- **WHEN** a revoked device never contacts the server again
- **THEN** it keeps its local copy, as the security limits state
