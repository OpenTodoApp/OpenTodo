# passkey-auth Specification

## Purpose
Adds passkeys as phishing-resistant credentials: when the server has an https public URL, users register passkeys on their devices, sign in with them instead of a password, and manage them by name, while the password remains a fallback.

## Requirements

### Requirement: Passkey availability and relying party
Passkeys SHALL be offered only when the relying-party identifier can be derived from the public base URL: its host, and only when the scheme is https or the host is a localhost development origin. The authentication status response SHALL state whether passkeys are available. When unavailable, every passkey route SHALL refuse with a `passkeys_unavailable` error and the client SHALL hide passkey controls. Availability is server configuration, not user data; nothing about it syncs.

#### Scenario: Https base URL
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and a client requests the authentication status
- **THEN** the response includes `passkeysAvailable: true`

#### Scenario: Plain http on a LAN
- **WHEN** `OPENTODO_BASE_URL` is unset or `http://192.168.1.10:8080` and a signed-in user tries to begin passkey registration
- **THEN** the response is a 409 `passkeys_unavailable` error and the status reports `passkeysAvailable: false`

### Requirement: Passkey registration
A signed-in user SHALL be able to register several passkeys through a two-step ceremony: `POST /api/v1/passkeys/register/options` returns a single-use challenge valid for five minutes, and `POST /api/v1/passkeys/register` verifies the response against that challenge and the server origin, then stores the credential id, public key, counter and a name. The server SHALL never hold a private key. Registration needs the network; the client SHALL disable it offline.

#### Scenario: Register a second passkey
- **WHEN** a signed-in user with one passkey completes the ceremony on another device with the name "Work laptop"
- **THEN** the response is 201 with the passkey's `id`, `name` and `createdAt`, and the account now lists two passkeys

#### Scenario: Anonymous request
- **WHEN** a request without credentials calls either registration route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Expired or reused challenge
- **WHEN** the finish step carries a challenge older than five minutes, one already consumed, or one issued to a different account
- **THEN** the response is a 400 `passkey_challenge_invalid` error and nothing is stored

#### Scenario: Origin or relying-party mismatch
- **WHEN** the authenticator response was produced for another origin or relying-party identifier
- **THEN** the response is a 400 `invalid_input` error and nothing is stored

### Requirement: Passwordless sign-in
An anonymous client SHALL be able to sign in with a passkey: `POST /api/v1/auth/passkey/options` returns a single-use challenge for a discoverable credential, and `POST /api/v1/auth/passkey` verifies the assertion, identifies the account from the credential, and starts a session under exactly the same cookie rules as password sign-in. Both routes SHALL be rate limited per client address like password sign-in.

#### Scenario: Sign in with a passkey
- **WHEN** a user completes the assertion with a passkey registered to their account
- **THEN** the response sets the session cookie, returns the user's public profile, and the passkey's last-use time is updated

#### Scenario: Unknown or revoked credential
- **WHEN** the assertion references a credential id the server does not know or has deleted
- **THEN** the response is a 401 `invalid_credentials` error that does not reveal whether any account exists

#### Scenario: Too many attempts
- **WHEN** a client address exceeds 10 passkey sign-in attempts within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error

### Requirement: Cloned authenticator detection
When a passkey reports signature counters, a sign-in whose counter is not greater than the stored counter SHALL be refused and the passkey SHALL be marked as suspicious until the user reviews it in Settings. Passkeys whose authenticators report a counter of zero SHALL be accepted without this check.

#### Scenario: Counter goes backwards
- **WHEN** an assertion arrives with a counter lower than or equal to the stored non-zero counter
- **THEN** the response is a 401 `invalid_credentials` error, no session is created, and the passkey shows a warning in Settings

### Requirement: Password remains a fallback
Registering passkeys SHALL NOT remove or weaken password sign-in. A user with passkeys SHALL still be able to sign in with email and password, and the sign-in screen SHALL offer both paths whenever passkeys are available.

#### Scenario: Password still works
- **WHEN** a user with two passkeys signs in with the correct email and password
- **THEN** the sign-in succeeds exactly as before passkeys were registered

#### Scenario: Passkey unavailable on this device
- **WHEN** the browser reports no passkey support or the user cancels the prompt
- **THEN** the sign-in screen falls back to the password form without an error state

### Requirement: Passkey naming and revocation
A signed-in user SHALL be able to list their passkeys through `GET /api/v1/passkeys` with name, creation time, last-use time and the suspicious flag, rename one through `PATCH /api/v1/passkeys/{id}`, and delete one through `DELETE /api/v1/passkeys/{id}`. A deleted passkey SHALL no longer sign in. Users SHALL only see and change their own passkeys. The server list is authoritative; the client does not cache it for offline use.

#### Scenario: Rename a device
- **WHEN** the user renames a passkey to "Phone"
- **THEN** the list shows "Phone" and the response is 200 with the updated passkey

#### Scenario: Revoke and retry
- **WHEN** the user deletes a passkey and then attempts a sign-in with it
- **THEN** the delete returned 204 and the sign-in is refused with a 401 `invalid_credentials` error

#### Scenario: Another user's passkey or anonymous access
- **WHEN** a signed-in user patches or deletes a passkey id that belongs to another account, or an anonymous request hits any of the three routes
- **THEN** the response is a 404 `not_found` error for the foreign id and a 401 `unauthorized` error for the anonymous request

### Requirement: Security settings for passkeys
Settings SHALL contain a Security section that lists passkeys, starts registration with a device name, renames, deletes, and highlights suspicious ones. The section SHALL be hidden when passkeys are unavailable, and while offline it SHALL show the last fetched list read-only with the actions disabled. Every control SHALL be reachable with the keyboard.

#### Scenario: Add a passkey from Settings
- **WHEN** the user chooses "Add passkey", names it and completes the browser prompt
- **THEN** the new passkey appears in the list with its name and "just now" as last use

#### Scenario: Offline settings
- **WHEN** Settings is opened with no network
- **THEN** the passkey controls are disabled with a message that managing passkeys needs a connection

### Requirement: Sign-in screen with passkeys
When passkeys are available, the sign-in screen SHALL show a "Sign in with a passkey" action and SHALL offer discoverable passkeys through the browser's autofill on the email field. When passkeys are unavailable the screen SHALL be unchanged. Offline behaviour of the app shell is unchanged: a previously signed-in device still opens from its cached account without a sign-in ceremony.

#### Scenario: Autofill sign-in
- **WHEN** the user focuses the email field and picks a passkey from the browser's suggestion
- **THEN** the app signs in without a password being entered and proceeds to the shell

#### Scenario: Offline app start
- **WHEN** an installed app that signed in earlier is opened offline
- **THEN** it opens to the user's tasks without presenting any passkey prompt
