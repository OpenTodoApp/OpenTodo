# Design

## Context

Accounts have the roles `owner` and `member`. Sign-up is closed by default, and the owner admits people through invitations. `auth.Service.CanInvite` is the single place that decides who may invite. Sessions and API tokens are rows keyed by `user_id` with `ON DELETE CASCADE`. Ops and fields are keyed by `user_id` without a foreign key. The realtime stream `GET /api/v1/sync/events` subscribes to a per-user notifier. The `audit-log` change, being built in parallel, defines `internal/audit` with typed event constructors and `RecordTx` for events that must commit with their state change. There is no outbound email, and the self-hosting principles rule out adding SMTP as a requirement.

## Goals / Non-Goals

**Goals:**
- The owner can see and manage every account without touching the database file.
- Delegation: a trusted second person (admin) can handle everyday member admin, but cannot take over the server.
- Deactivation cuts off access completely and at once, while destroying nothing.
- Reset without email: a link that the administrator delivers by hand, like invitations.
- Exactly one owner at all times, enforced by the database transaction and not only by the UI.

**Non-Goals:**
- Project transfer on deletion (needs `project-sharing`), email delivery, self-service "forgot password", bulk actions, remote wipe of device-local data, editing another user's email or name.

## Decisions

### D1. Role matrix in one function
`auth.Authorize(actor, action, target) error` replaces the scattered role checks, and `CanInvite` becomes `Authorize(actor, ActionInvite, nil) == nil`. The rules:

| Action | owner | admin | member |
| --- | --- | --- | --- |
| invite, list invitations, revoke invitation | yes | yes | no |
| list users | yes | yes | no |
| deactivate / reactivate / reset / delete a `member` | yes | yes | no |
| deactivate / reactivate / reset / delete an `admin` | yes | no | no |
| any action on the `owner` | no (self) | no | no |
| change role (`admin` ↔ `member`) | yes | no | no |
| transfer ownership | yes | no | no |
| change own password | yes | yes | yes |

Checks run in this order:
1. A self-target gives `ErrSelfAction` (409 `self_action`).
2. An unauthorized actor gives `ErrForbidden` (403).
3. A wrong target state gives `ErrAccountDeactivated` or `ErrAccountActive` (409).

The owner can never be a target. The only way the owner role changes is a transfer the owner starts. Invitations still grant only `member`, because an admin inviting admins would let admins create peers.

- Alternative: let admins promote members to admin. Rejected: an admin could then create accounts the owner did not choose to trust. Promotion stays an owner decision.
- Alternative: let admins act on other admins. Rejected: two admins could lock each other out. Only the owner arbitrates.

### D2. Data model (additive)
New migration `internal/store/migrations/NNNN_user_management.sql`. The number is **provisional**: today `0002_invitations.sql` is the latest on `main`, so this would be `0003`. Several in-flight changes also plan `0002`/`0003` files, so the implementer takes the next free number when merging. Contents:
- `ALTER TABLE users ADD COLUMN deactivated_at INTEGER` (NULL means active).
- `ALTER TABLE users ADD COLUMN last_login_at INTEGER` (NULL means never signed in since the upgrade; it is not backfilled).
- `CREATE TABLE password_resets(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, revoked_at INTEGER)`, with an index on `user_id`.
- The `role` column keeps its type. `admin` is a new allowed value, not a rename. Older binaries treat `admin` like any non-owner role, which is the safe direction.

Status is derived from `deactivated_at`. No status column, so there is nothing to keep in sync. No change to `ops`, `fields`, the op schema (`internal/sync/ops.go`, `web/src/lib/types.ts`) or the sync protocol. Nothing in this change is synced.

### D3. Deactivation is one transaction plus a stream kick
`Deactivate(actor, id)` does all of the following in one SQLite transaction:
- set `deactivated_at`;
- `DELETE FROM sessions WHERE user_id=?`;
- `DELETE FROM api_tokens WHERE user_id=?`;
- `UPDATE invitations SET revoked_at=? WHERE created_by=? AND accepted_at IS NULL AND revoked_at IS NULL`;
- `UPDATE password_resets SET revoked_at=? WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL`;
- the audit `RecordTx`.

After commit the handler calls `notifier.CloseUser(userID)`, a new method on the existing notifier. It closes every subscription channel for that user, so `handleEvents` returns and the stream ends. Because sessions and tokens are gone, the client's reconnect gets 401.

As defense in depth, `UserBySession` and `UserByToken` add `AND u.deactivated_at IS NULL`. A row that somehow survived therefore still cannot authenticate. `Authenticate` checks the password first and only then checks `deactivated_at`. This order is what makes the error distinguish deactivation only to someone who already knows the password.

### D4. Deletion removes server data in one transaction
`DeleteUser` runs in one transaction:
- `DELETE FROM ops WHERE user_id=?` and `DELETE FROM fields WHERE user_id=?` (no foreign key, so these are explicit);
- `DELETE FROM users WHERE id=?`, which cascades to sessions, tokens, password resets and invitations created by the user;
- the audit event, which carries an email snapshot as `audit-log` D2 already plans.

Deleting the invitations an account created also deletes that history. This is acceptable because the audit log keeps the record. After commit: `notifier.CloseUser`.

Today every project is private, so there is nothing to transfer. When `project-sharing` lands, it will make deletion of an owner of shared projects either refuse or transfer. That is called out as its responsibility, and this change's tasks leave a single `beforeDelete` hook for it. Deletion takes no "transfer" flag yet, so the API has no option that does nothing.

### D5. Reset links mirror invitations
Reset links work like invitations (`invitations` D1):
- The secret is 256 bits, URL-safe base64, with the prefix `otr_`. Only its sha256 is stored.
- The link is `<origin>/reset/<secret>`, with the same origin fallback as invitation links.
- Issuing a new link revokes older unused ones in the same transaction.
- Consuming the link uses a conditional `UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`. The new password hash and `DELETE FROM sessions` run in the same transaction, so two concurrent uses yield exactly one success.
- API tokens survive a reset. A reset means "forgot password", not "compromised". If an account is compromised, the administrator deactivates it, which does revoke tokens. The UI says this next to the reset action.
- Default expiry is 24 hours, with a range of 1 to 72. This is shorter than invitations because a reset link grants an existing account with data.

### D6. Self-service password change
`ChangePassword(userID, current, next, keepSessionHash)` verifies the current password, sets the new hash and runs `DELETE FROM sessions WHERE user_id=? AND token_hash<>?`. When the request is authenticated by a bearer token (a script), every session is deleted, because there is no current session to keep.

### D7. Owner transfer
`TransferOwnership(owner, targetID, password)` re-verifies the password and runs one transaction:
1. `UPDATE users SET role='admin' WHERE id=? AND role='owner'`. It must affect exactly one row, or the transaction ends with `ErrForbidden`.
2. `UPDATE users SET role='owner' WHERE id=? AND deactivated_at IS NULL AND role<>'owner'`. It must affect one row, or the transaction ends with `ErrAccountDeactivated` / `ErrNotFound`.
3. `SELECT COUNT(*) FROM users WHERE role='owner'` must equal 1.
4. Audit event.

The server uses a single SQLite connection, so concurrent transfers run one after another. The second finds that its actor is no longer owner and fails with 403.

The same single-owner assertion (step 3) runs at the end of every role or status transaction, as a guard against future bugs. A partial unique index `CREATE UNIQUE INDEX users_one_owner ON users(role) WHERE role='owner'` enforces "at most one owner" in the database itself. The migration adds it after checking that the existing data has exactly one owner, which is always true because bootstrap creates one.

### D8. Routes
All routes are registered with `requireAuth` except the two reset-link routes. They are placed before the generic `/{collection}` patterns, as the invitation routes are.

| Route | Who | Success |
| --- | --- | --- |
| `GET /api/v1/users` | owner, admin | 200 `{users:[…]}` |
| `PUT /api/v1/users/{id}/role` | owner | 200 `{user}` |
| `POST /api/v1/users/{id}/deactivate` | per D1 | 200 `{user}` |
| `POST /api/v1/users/{id}/reactivate` | per D1 | 200 `{user}` |
| `DELETE /api/v1/users/{id}` | per D1 | 204 |
| `POST /api/v1/users/{id}/password-reset` | per D1 | 201 `{expiresAt, link}` |
| `POST /api/v1/users/{id}/transfer-ownership` | owner | 200 `{user}` |
| `POST /api/v1/me/password` | any signed-in | 204 |
| `GET /api/v1/password-resets/{token}` | public, per-IP limit | 200 `{email, expiresAt}` |
| `POST /api/v1/password-resets/{token}` | public, per-IP limit | 204 |

New error codes: `self_action`, `account_deactivated`, `account_active`, `confirmation_mismatch`, `reset_invalid`. The existing codes `forbidden`, `not_found`, `invalid_input`, `invalid_credentials` and `rate_limited` are reused. The public reset routes check `originAllowed` on POST, like register.

`PUT …/role` is used rather than `PATCH /users/{id}` so that each action has one narrow, separately rate-limited and audited endpoint.

### D9. Rate limits
The existing `rateLimiter` gets two more instances:
- `adminLimiter`: 60 per hour, keyed by acting user id, shared by all mutating `/users` routes.
- `passwordLimiter`: 10 per hour, keyed by user id, for `/me/password`.

Reset-link routes use the existing per-IP `limiter` (10 per minute). `GET /api/v1/users` is not limited because it is read-only and owner/admin only.

### D10. Audit integration (dependency on `audit-log`)
This change adds the typed constructors `audit.UserDeactivated`, `UserReactivated`, `UserDeleted(email)`, `PasswordResetIssued(resetID)`, `PasswordResetCompleted(resetID)`, `PasswordChanged`, `OwnerTransferred(from, to)` and `RoleChanged(from, to)` to the `audit-log` catalogue, and the reason `deactivated` for `login.failed`.

The order depends on which change merges first:
- If `audit-log` is merged first, every service method calls `RecordTx` inside its transaction.
- If this change merges first, each emission point is a call to a small `recorder` interface whose default implementation does nothing. Task 6.1 wires it to `internal/audit` once that package exists. No event is lost silently: until then there is simply no audit log on the server.

### D11. Client
- `UsersPanel` is rendered when `user.role` is `owner` or `admin`. It fetches `GET /api/v1/users` when the panel opens and keeps the result in component state only, never in Dexie.
- Row actions come from the same matrix as D1, mirrored in `web/src/lib/roles.ts` with a unit test. The server stays authoritative, and a 403 shows a toast.
- Delete opens a dialog that requires typing the email.
- Reset shows the link once with a copy button.
- Transfer opens a password prompt.
- Keyboard: rows are focusable. `d` deactivates or reactivates, `r` resets and `Delete` deletes, each with a confirmation, and the keys are listed in `?` help.
- The `PasswordSection` (every user) and the `/reset/:token` route reuse the existing form components and the offline detection used by `InviteScreen`.
- Offline: actions are disabled with an explanation, and no user list is ever persisted. When the app gets a 401 after deactivation or deletion, it shows the signed-out screen. Local data on that device is left alone, as on any sign-out.

### D12. Offline and convergence statement
User administration is online-only server data. It is not written to the op log, it is not in IndexedDB, and it cannot be queued. The server is the only replica of account state, so no convergence rules apply to it.

The only interaction with sync is indirect:
- A deactivated account's devices cannot push until reactivation. Their local ops then sync and converge under the normal LWW rule.
- A deleted account's devices can never push again, and their ops are discarded with the account.

### D13. Footprint
- No new Go or npm dependency.
- Binary: about 20 to 30 KB of handlers and SQL.
- Runtime memory: two small limiter maps.
- Bundle: about 4 KB gzipped for the panel, the password section and the reset screen.
- Disk: two columns per user and one small row per reset link.

## Risks / Trade-offs

- **Admin abuses delete.** Admins can delete only members, deletion asks for the email to be typed, actions are rate limited and audited, and the owner can demote the admin at once. Deletion is irreversible by design. Backups (`backups`) are the recovery path, and the dialog says so.
- **Reset link leaks.** It is single-use, expires in 24 hours by default, issuing a new link revokes the old one, deactivation revokes it, and the preview shows only the email.
- **Owner loses their own password.** No one can reset the owner through the API, because the owner is never a target. Recovery is a documented CLI path: `opentodo reset-owner-password`, run inside the container, which prints a reset link. It needs shell access to the data directory, which already implies full control. This is tasked as a small CLI subcommand, not an HTTP route.
- **Owner transfers to the wrong account.** The transfer requires password re-entry and a confirmation dialog naming the target. The new owner can transfer back.
- **Existing sessions of a demoted admin.** Role is read from `users` on every request (the join in `UserBySession`), so a demotion takes effect on the next request without revoking sessions.
- **`last_login_at` is empty after the upgrade.** The list shows "never since upgrade" until the next sign-in. There is no backfill source.
- **Migration number collides with parallel changes.** The number is marked provisional, and the implementer renumbers at merge time.

## Migration Plan

The migration is additive: two nullable columns, one table and one partial unique index. Rolling back to an older binary ignores them. Deactivated accounts would then be able to sign in again, which the release notes call out. No client storage change.

## Open Questions

- Should deactivation optionally sign out the account's devices *and* ask them to drop local data on next contact? This is deferred because it needs a protocol message and cannot be guaranteed for devices that never reconnect.
- Should the admin role also manage server settings such as audit retention? Proposed answer: no, those stay owner-only, and the role can be widened later through D1.
