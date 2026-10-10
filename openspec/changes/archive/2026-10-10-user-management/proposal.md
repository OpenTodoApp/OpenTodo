# Proposal

## Why

A server can now gain members through invitations, but once an account exists the owner has no way to manage it. They cannot see who has an account or when it last signed in. They cannot lock out a lost laptop's account, remove someone who has left the household, or help a member who forgot their password. Members cannot change their own password either. The only fallback is editing the SQLite file by hand, which bypasses every safety check and is not something a self-hoster should have to do. A small user administration surface closes this gap and keeps the server self-sufficient.

## What Changes

- A new `user-administration` capability:
  - A Users panel in Settings and REST routes under `/api/v1/users` that list every account with email, name, role, creation time, last sign-in and status (`active` or `deactivated`).
  - A third role, `admin`, between `owner` and `member`. Admins can invite, list users, and deactivate, reactivate, reset the password of, or delete **members**. They cannot act on the owner or on other admins, cannot change roles and cannot transfer ownership. Only the owner promotes and demotes.
  - Deactivation keeps all of the account's data but blocks sign-in. In the same transaction it revokes every session and API token, revokes the account's pending invitations and unused reset links, and closes its open realtime streams. Reactivation lifts the block. Credentials are not restored.
  - Deletion removes the account and all of its data from the server (ops, materialized fields, sessions, tokens, reset links). It requires typing the account's email to confirm.
  - An owner- or admin-initiated password reset produces a single-use, expiring reset link that the administrator copies and delivers. Nothing is sent by email. Using the link sets a new password and revokes the account's sessions.
  - Every signed-in user can change their own password by giving their current password. This signs out all of their other sessions.
  - Owner transfer: the owner hands ownership to another active account after re-entering their password. The previous owner becomes an admin. There is exactly one owner at all times.
  - Safety rules: no administrator can deactivate, delete, demote or reset themselves through the admin routes. Ownership changes only through transfer, which keeps the one-owner rule. Every mutating action is rate limited per acting account. Reset-link use is rate limited per client address.
- The modified `account-access` requirement "Sign-in and sessions" adds deactivated-account behaviour. A correct password for a deactivated account gets a 403 `account_deactivated` error. A wrong password still gets the uniform `invalid_credentials` error.
- When the `audit-log` change is present, every administrative action records an event in the same transaction as the change. That change is being implemented in parallel, so this is stated as a dependency rather than a prerequisite. If this change merges first, the emission points are left as marked hooks and wired when `audit-log` lands.

Out of scope:
- Transferring a deleted user's projects to another account. Until `project-sharing` lands every project is private to its creator, so deletion removes them. Transfer on deletion is deferred to `project-sharing`, or to a follow-up change after it.
- Email delivery of reset links. There is no outbound mail; the administrator copies the link.
- Self-service "forgot password" from the sign-in screen without an administrator.
- Bulk actions, account renaming by administrators, and changing another user's email.
- Remotely wiping data that a deleted or deactivated account still has in a device's local storage.
- Per-project roles (`project-sharing`), and second-factor resets (`mfa-totp` defines its own owner reset).

This change advances ROADMAP.md section 7, "User administration: list users, admin role, deactivate, delete, password reset, owner transfer" (`user-management`). It also completes the "member removal and role changes" item that the archived `invitations` change deferred.

No new mandatory environment variable. No change to the op-log format. User administration is server-side account data: it is never written to the op log, never syncs to devices, and every action requires a network connection.

## Capabilities

### New Capabilities
- `user-administration`: the role model including `admin`, the user list, role changes, deactivation and reactivation, deletion, administrator-issued password reset links, self-service password change, owner transfer, safety rules, rate limits, audit emission and the Settings surfaces.

### Modified Capabilities
- `account-access`: "Sign-in and sessions" gains the deactivated-account error and states that deactivation and password changes revoke sessions.
- `invitations`: three requirements now name admins next to the owner, as the `admin` role requires: "Invitation creation", "Invitation list and revocation" and "Invitation management in Settings". Invitations still admit only `member` accounts.

## Impact

- Server:
  - An additive migration adds `users.deactivated_at`, `users.last_login_at` and a `password_resets` table.
  - New auth service methods, about ten route registrations, and an authorization helper that replaces the owner-only `CanInvite` check with a role matrix.
  - A per-user hook on the existing event notifier that closes streams.
  - Changes to `Authenticate`, `UserBySession` and `UserByToken` so deactivated accounts are refused.
- Web app:
  - A Users panel in Settings for the owner and admins.
  - A Password section for every user.
  - A `/reset/<token>` screen.
  - API client functions for the new routes.
- Docs: `docs/api.md`, `docs/self-hosting/*.md` (recovering access without editing the database) and `SECURITY.md`.
- Dependencies: none added. Binary size grows by a few tens of KB at most. The bundle grows by roughly 4 KB gzipped.
