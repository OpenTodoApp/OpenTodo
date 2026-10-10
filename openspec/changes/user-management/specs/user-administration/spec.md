# Spec Delta

## Purpose
Lets the owner, and admins within narrower limits, administer the accounts on a server: list them, change roles, deactivate, reactivate and delete accounts, issue single-use password reset links, and transfer ownership. Every user can change their own password. All of it is online-only server data that never enters the op log, and it is protected by self-action rules, a single-owner invariant, rate limits and audit events.

## ADDED Requirements

### Requirement: Roles and administrative permissions
Every account SHALL have exactly one role: `owner`, `admin` or `member`, and exactly one active account SHALL hold `owner`. The owner MAY perform every administrative action on any other account. An admin MAY invite, list users, and deactivate, reactivate, reset or delete accounts with the role `member`, and SHALL NOT act on the owner or another admin, change roles or transfer ownership. Members SHALL have no administrative rights.

#### Scenario: Admin manages a member
- **WHEN** an admin deactivates an account with the role `member`
- **THEN** the request succeeds with 200 and the member's status becomes `deactivated`

#### Scenario: Admin cannot act on another admin or the owner
- **WHEN** an admin sends deactivate, reactivate, password reset or delete for an account with the role `admin` or `owner`
- **THEN** the response is a 403 `forbidden` error and nothing changes

#### Scenario: Admin can invite
- **WHEN** an admin creates an invitation through `POST /api/v1/invitations`
- **THEN** the invitation is created exactly as for the owner and still admits a `member`

#### Scenario: Member has no administrative rights
- **WHEN** an account with the role `member` calls any `/api/v1/users` route
- **THEN** the response is a 403 `forbidden` error

### Requirement: User list
The owner and admins SHALL list all accounts through `GET /api/v1/users`, sorted by creation time. Each entry SHALL have id, email, name, role, `createdAt`, `lastLoginAt` (or null) and status `active` or `deactivated`, and SHALL never contain a password hash or credential. Accounts created by accepting an invitation SHALL appear like any other. The list is read live from the server and is not synced.

#### Scenario: List after an invitation is accepted
- **WHEN** an invitee registers with a valid invitation and the owner then lists users
- **THEN** the new account appears with the role `member`, status `active` and `lastLoginAt` set to its registration sign-in

#### Scenario: Last sign-in is tracked
- **WHEN** a user signs in with valid credentials
- **THEN** that user's `lastLoginAt` in the list equals the time of that sign-in

#### Scenario: Anonymous list request
- **WHEN** a request without credentials sends `GET /api/v1/users`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Member lists users
- **WHEN** an account with the role `member` sends `GET /api/v1/users`
- **THEN** the response is a 403 `forbidden` error and no account data is returned

### Requirement: Role changes
Only the owner SHALL change roles, through `PUT /api/v1/users/{id}/role` with body `{"role": "admin" | "member"}`. This promotes an active member to admin or demotes an admin to member. The role `owner` SHALL NOT be assigned or removed through this route; ownership moves only by transfer. A demoted admin's existing sessions SHALL immediately carry the new role.

#### Scenario: Owner promotes a member
- **WHEN** the owner sets the role of an active member to `admin`
- **THEN** the response is 200 with the updated user, and that user's next request is authorized as an admin

#### Scenario: Owner demotes an admin
- **WHEN** the owner sets the role of an admin to `member`
- **THEN** the response is 200 and that user's next call to `GET /api/v1/users` is refused with 403 `forbidden`

#### Scenario: Owner role is not assignable
- **WHEN** the owner sends `{"role": "owner"}`, an unknown role, or targets their own account
- **THEN** the response is a 400 `invalid_input` error for the role value or a 409 `self_action` error for the own account, and nothing changes

#### Scenario: Role change by a non-owner
- **WHEN** an admin or a member sends a role change
- **THEN** the response is a 403 `forbidden` error

#### Scenario: Anonymous role change
- **WHEN** a request without credentials sends `PUT /api/v1/users/{id}/role`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Unknown or deactivated target
- **WHEN** the target id does not exist, or the target account is deactivated
- **THEN** the response is a 404 `not_found` error or a 409 `account_deactivated` error respectively

### Requirement: Deactivation
`POST /api/v1/users/{id}/deactivate` SHALL mark the account deactivated. In one transaction it SHALL delete all of its sessions and API tokens and revoke its pending invitations and unused reset links. Its open realtime streams SHALL be closed within five seconds. Its data SHALL be kept unchanged on the server. Other users' devices are unaffected, and the deactivated account's devices keep their local copy but can no longer sync.

#### Scenario: Deactivation revokes all access
- **WHEN** the owner deactivates a member who has two signed-in browsers, one API token and an open `/api/v1/sync/events` stream
- **THEN** both session cookies and the token now get 401 `unauthorized`, the stream is closed by the server, and the member's ops and fields remain on the server

#### Scenario: Deactivated device keeps working offline
- **WHEN** a deactivated member's device that was offline makes changes and later reconnects
- **THEN** its local data stays readable and editable on the device, its sync attempt is refused with 401 `unauthorized`, and no op from it is accepted

#### Scenario: Pending invitations of a deactivated admin
- **WHEN** an admin with a pending invitation is deactivated
- **THEN** the invitation's status becomes `revoked` and its link is refused with `invitation_invalid`

#### Scenario: Deactivating an already deactivated account
- **WHEN** the target is already deactivated
- **THEN** the response is a 409 `account_deactivated` error and nothing changes

#### Scenario: Anonymous deactivation
- **WHEN** a request without credentials sends the deactivate request
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Reactivation
`POST /api/v1/users/{id}/reactivate` SHALL clear the deactivation of an account so it can sign in again with its existing password, keeping its role and data. Revoked sessions, tokens, invitations and reset links SHALL NOT be restored. When the account next signs in, its devices sync normally, and ops they made while it was deactivated converge under the usual last-writer-wins rule.

#### Scenario: Reactivated account signs in again
- **WHEN** the owner reactivates a deactivated member and the member signs in with their password
- **THEN** the sign-in succeeds, the old API token still gets 401, and pending local changes from the member's device are accepted and converge

#### Scenario: Reactivating an active account
- **WHEN** the target is already active
- **THEN** the response is a 409 `account_active` error and nothing changes

#### Scenario: Anonymous reactivation
- **WHEN** a request without credentials sends the reactivate request
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Account deletion
`DELETE /api/v1/users/{id}` with body `{"confirmEmail": "<target email>"}` SHALL permanently delete the account and all of its server data: ops, materialized fields, sessions, tokens, reset links and created invitations. Its projects are deleted and cannot be transferred. Audit events about it SHALL be kept. Once deleted, the account's devices cannot sync. Other accounts' data is unaffected, so no convergence is involved.

#### Scenario: Owner deletes a member and its data
- **WHEN** the owner deletes a member and sends the member's email as `confirmEmail`
- **THEN** the response is 204, the account is gone from the list, its ops and fields no longer exist, its email can register again, and other users' data is unchanged

#### Scenario: Confirmation does not match
- **WHEN** `confirmEmail` is missing or differs from the target's email compared case-insensitively
- **THEN** the response is a 400 `confirmation_mismatch` error and nothing is deleted

#### Scenario: Anonymous deletion
- **WHEN** a request without credentials sends `DELETE /api/v1/users/{id}`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Unknown account
- **WHEN** the id does not belong to an account
- **THEN** the response is a 404 `not_found` error

### Requirement: Password reset links
`POST /api/v1/users/{id}/password-reset` SHALL create a single-use reset link for an active account. The link expires after 24 hours, or 1 to 72 hours if `expiresInHours` is given. It is returned exactly once and only its hash is stored. A new link SHALL invalidate any unused earlier link for the same account. Issuing a link does not change the password or sessions. Nothing is emailed. The administrator copies the link.

#### Scenario: Owner issues a reset link
- **WHEN** the owner requests a reset for an active member
- **THEN** the response is 201 with `expiresAt` and a `link` of the form `<origin>/reset/<secret>` that is never returned again

#### Scenario: Reset for a deactivated account or an invalid expiry
- **WHEN** the target is deactivated, or `expiresInHours` is outside 1 to 72
- **THEN** the response is a 409 `account_deactivated` error or a 400 `invalid_input` error naming the field respectively

#### Scenario: Anonymous reset request
- **WHEN** a request without credentials sends the password reset request
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Using a reset link
`GET /api/v1/password-resets/{token}` and `POST /api/v1/password-resets/{token}` SHALL require no authentication. GET returns the account's email and the expiry. POST with `{"password"}` sets a new password under the password policy, marks the link used, and deletes every session of the account in one transaction. It does not sign in. API tokens are kept. An unknown, used, expired or revoked token SHALL give the same 404 `reset_invalid` error.

#### Scenario: Reset succeeds
- **WHEN** someone posts a valid new password to a pending reset link
- **THEN** the response is 204, the old password no longer signs in, the new one does, all previous sessions get 401, and the link is now refused

#### Scenario: Link is used, expired or unknown
- **WHEN** a used, expired, revoked or unknown token is fetched or posted
- **THEN** the response is a 404 `reset_invalid` error with the same shape in every case

#### Scenario: Weak new password
- **WHEN** the posted password has fewer than 10 characters
- **THEN** the response is a 400 `invalid_input` error and the link stays pending

#### Scenario: No authentication needed but rate limited
- **WHEN** an anonymous client exceeds 10 fetch or post attempts on reset links within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error

### Requirement: Self-service password change
Every signed-in user SHALL be able to change their own password through `POST /api/v1/me/password` with `currentPassword` and `newPassword`. The new password SHALL meet the password policy. On success every other session of the user SHALL be deleted while the current session stays valid, and API tokens SHALL be kept. The change requires a network connection and is never queued offline.

#### Scenario: Password changed
- **WHEN** a member submits the correct current password and a valid new one
- **THEN** the response is 204, the current session keeps working, the member's other sessions get 401, and only the new password signs in

#### Scenario: Wrong current password
- **WHEN** the current password is wrong
- **THEN** the response is a 403 `invalid_credentials` error and the password is unchanged

#### Scenario: Anonymous password change
- **WHEN** a request without credentials sends `POST /api/v1/me/password`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Weak new password
- **WHEN** the new password has fewer than 10 characters
- **THEN** the response is a 400 `invalid_input` error naming the minimum length

### Requirement: Owner transfer
The owner SHALL transfer ownership through `POST /api/v1/users/{id}/transfer-ownership` with their current `password`. The target must be an active account other than the owner. In one transaction the target SHALL become `owner` and the previous owner SHALL become `admin`, so exactly one owner exists before and after. The previous owner's sessions stay valid with the new role.

#### Scenario: Ownership handed over
- **WHEN** the owner transfers ownership to an active admin with the correct password
- **THEN** the response is 200, the list shows exactly one `owner` (the target) and the previous owner as `admin`

#### Scenario: Invalid transfer target or password
- **WHEN** the target is deactivated, is the owner themselves, or the password is wrong
- **THEN** the response is a 409 `account_deactivated`, a 409 `self_action` or a 403 `invalid_credentials` error respectively and roles are unchanged

#### Scenario: Transfer by a non-owner
- **WHEN** an admin or member sends a transfer request
- **THEN** the response is a 403 `forbidden` error

#### Scenario: Anonymous transfer
- **WHEN** a request without credentials sends a transfer request
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Self-action and single-owner protection
No account SHALL deactivate, delete, demote, reset or change its own role through `/api/v1/users` routes. Those requests MUST fail with 409 `self_action`. The owner account MUST NOT be deactivated, deleted or demoted by anyone. The server MUST keep exactly one active owner, checked inside the same transaction as every role or status change, so concurrent requests cannot leave zero or two owners.

#### Scenario: Owner tries to deactivate themselves
- **WHEN** the owner sends deactivate, delete or a role change for their own id
- **THEN** the response is a 409 `self_action` error and nothing changes

#### Scenario: Concurrent transfers
- **WHEN** two transfer requests from the owner to different targets arrive at the same time
- **THEN** exactly one succeeds, the other is refused with 403 `forbidden` because its sender is no longer owner, and exactly one owner exists

### Requirement: Owner recovery from the server shell
The owner account is never a target of the reset route. The server binary SHALL therefore provide a `reset-owner-password` subcommand that prints a single-use owner reset link, valid for 24 hours, which behaves like any reset link. It SHALL require only access to the data directory. It SHALL open no network listener and need no configuration.

#### Scenario: Owner forgot their password
- **WHEN** the operator runs `opentodo reset-owner-password` against the data directory
- **THEN** a reset link is printed, setting a new password through it succeeds once, and a second use is refused with `reset_invalid`

### Requirement: Administrative rate limits
Each acting account SHALL be limited to 60 mutating user-administration requests per hour, counting role changes, deactivation, reactivation, deletion, reset issuance and transfer. Self-service password changes SHALL be limited to 10 per account per hour. Reset-link use SHALL share the per-address sign-in limit.

#### Scenario: Administrator exceeds the limit
- **WHEN** an admin sends a 61st mutating request within one hour
- **THEN** the response is a 429 `rate_limited` error and nothing changes

#### Scenario: Password change guessing
- **WHEN** a session sends an 11th password change within one hour
- **THEN** the response is a 429 `rate_limited` error even if the current password is correct

### Requirement: Audit events for administration
When the `audit-log` capability is present, the server SHALL record each administrative action in the same transaction as the change. The events are `role.changed`, `user.deactivated`, `user.reactivated`, `user.deleted`, `password.reset_issued`, `password.reset_completed`, `password.changed` and `owner.transferred`, plus `login.failed` with reason `deactivated`. Each records actor, target and outcome, and never a password or link secret.

#### Scenario: Deactivation is audited
- **WHEN** `audit-log` is present and the owner deactivates a member
- **THEN** a `user.deactivated` event with the owner as actor and the member as target exists if and only if the deactivation committed

#### Scenario: Reset secret is never logged
- **WHEN** an admin issues a reset link and it is later used
- **THEN** the `password.reset_issued` and `password.reset_completed` events exist and neither contains the secret or the new password

### Requirement: Users panel in Settings
The web app SHALL show a Users section in Settings to the owner and admins. It lists accounts with role, status, creation and last sign-in, and shows only the actions the viewer may take on each row. Delete asks for the email. Reset and new-password links are shown once with a copy button. All actions SHALL work by keyboard. The section is online-only: offline, actions are disabled, and no user data is stored in IndexedDB.

#### Scenario: Admin sees member actions only
- **WHEN** an admin opens the Users section
- **THEN** rows for members show deactivate, reset and delete actions, rows for admins and the owner show none, and no role or transfer controls appear

#### Scenario: Member sees no Users section
- **WHEN** an account with the role `member` opens Settings
- **THEN** the Users section is absent and the Password section is present

#### Scenario: Offline users panel
- **WHEN** the owner opens the Users section without a network connection
- **THEN** every action is disabled with a message that user administration needs a connection, and nothing about other accounts is read from or written to IndexedDB

### Requirement: Password and reset screens
Settings SHALL offer every user a Password section to change their password. Opening `/reset/<token>` SHALL show the account email and a new-password form, then send the user to sign-in on success. An invalid link SHALL explain that it is no longer valid. A signed-in visitor SHALL be offered sign-out first. Offline, both screens SHALL say a connection is needed and SHALL NOT queue the change.

#### Scenario: Reset link opened
- **WHEN** a valid reset link is opened in a browser that is not signed in
- **THEN** the screen shows the account email and a password form, and after a successful submit it shows the sign-in screen with a confirmation

#### Scenario: Reset link opened offline
- **WHEN** the reset link is opened with no network
- **THEN** the screen shows an offline message and retries when the network returns, without caching anything
