# A revoked device removes its local copy

## Why

The threat model (`docs/security/threat-model.md`, "Stolen or unlocked device") lists under "Not defended": "A device that was never locked or signed out keeps its local copy after its sessions are revoked: it can no longer sync, but its data stays." Signing out everywhere, or an admin deactivating or deleting an account, is what someone does when a device is lost or a person leaves. Today it stops the device syncing but leaves everything it held readable on it. Second security wave, item 1.

## What Changes

- When an account's sessions are revoked on purpose (**Sign out everywhere**, deactivation, deletion of the account), the server remembers each revoked session for a year: its token hash and a per-session **wipe key** the device learned while it was signed in.
- `GET /api/v1/auth/status` hands a signed-in browser session its wipe key (`wipeKey`), and answers the cookie of a revoked session with `revoked: {proof}`, an HMAC-SHA256 under that key. A session that merely expired, or was ended by a password change or reset, gets no proof and the device keeps its data, as today.
- The web app checks the proof with the key it stored. Only when it matches does it remove its local copy, with the same clear as signing out: IndexedDB with the outbox, the stored and in-memory encryption key, the native shell's reminders, geofences, widget and biometric key, the badge, and the HTTP cache through sign-out's `Clear-Site-Data`. It then shows the sign-in screen with "This device was signed out and its data was removed." A forged answer, or one for another session, changes nothing.
- Device-bound server state of a revoked session goes with it: push subscriptions (already, by cascade) and the device relay's opt-ins, whose open relay streams close.
- Unsynced changes on a revoked device are lost. The Sign out everywhere and Deactivate confirmations say so. A device that never connects again keeps its copy, and the docs keep that sentence.

No new route and no new environment variable. Not **BREAKING**: `auth/status` gains two optional fields, which older clients ignore.

Out of scope: API tokens and the clients that hold them (`ot`, the vault, the Obsidian plugin, the browser extension); a vault is the person's own Markdown files and is never deleted remotely. A per-session device list with a sign-out button per device. Wiping a device that stays offline (it happens on next contact).

ROADMAP: advances `external-security-review` (second wave). No new item.

## Capabilities

### Modified Capabilities

- `account-access`: a new requirement, "A revoked device removes its local copy".

## Impact

- Migration `0061_revoked_sessions.sql` (two additive tables); `internal/auth/revoke.go` (wipe keys, revocation records, the proof, pruning), called from `SignOutEverywhere`, `Deactivate` and `DeleteUser`.
- `internal/httpapi/auth_handlers.go` (`auth/status`) and `users.go` (relay opt-ins of revoked sessions); `internal/relay` (`DisableEnded`); `internal/tenant/jobs.go` (pruning in housekeeping).
- `web/src/lib/revocation.ts`, `web/src/app/App.tsx`, the two confirmations and their translations.
- Docs: `docs/security/threat-model.md`, `limits.md`, `how-we-verify.md`, `docs/api.md`; changelog fragment `changelog.d/Security/revoked-device-wipe.md`.
