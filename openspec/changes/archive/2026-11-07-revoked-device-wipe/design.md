## Context

A browser session is a random secret in an `HttpOnly` cookie; the server stores its SHA-256 in `sessions`. Ending a session deletes the row, so afterwards the server cannot tell a revoked cookie from an expired or unknown one: both get 401 `unauthorized`, and the web app shows the sign-in screen and keeps its local copy (`App.tsx`: "Local data is left alone, as on any expired session"). Signing out on the device itself already clears everything through `clearDeviceData` (`web/src/app/signOut.ts`).

## Decisions

### D1 — Which ends of a session remove the device's copy

Only the explicit decisions to cut devices off: **Sign out everywhere** (`POST /api/v1/me/sign-out-everywhere`), deactivation and deletion of the account by an admin (`POST /api/v1/users/{id}/deactivate`, `DELETE /api/v1/users/{id}`). A password change (which ends the other sessions) and a password reset end sessions so that the devices sign in again; they keep their data and their outbox, which uploads after the next sign-in. Wiping on a routine password change would lose offline work for no gain: someone who suspects a stolen device signs out everywhere. Expiry and the device's own sign-out are unchanged.

### D2 — Remembering a revoked session

Migration `0061_revoked_sessions.sql` adds `session_wipe_keys(token_hash → sessions ON DELETE CASCADE, wipe_key)` and `revoked_sessions(token_hash PRIMARY KEY, wipe_key, revoked_at, keep_until)`. `auth.revokeSessionsTx` copies the sessions about to be deleted, with their wipe keys, into `revoked_sessions` in the same transaction that deletes them, so a revocation cannot half-happen. A session without a wipe key (one that has not loaded the app since the upgrade) is not recorded and behaves as an expired one. The table holds no user id, email or address: a session hash and a key, nothing a reader can tie to a person once the session is gone.

Rows are kept for a year after the revocation (`auth.RevokedRetention`), longer than the default 90-day session lifetime, so a device that comes back months later still removes its copy. Housekeeping prunes them (`PruneRevokedSessions`, its next deadline in `nextHousekeeping`); no new job.

### D3 — A proof only the real server can give

The worry is a forged "revoked" answer wiping a device that was never revoked. The answer is authenticated with a secret only that device and the server hold:

- While signed in, `GET /api/v1/auth/status` returns `wipeKey`: 32 random bytes, base64url, created for the session the first time it asks and stored in `session_wipe_keys`. Every sign-in path (password, second step, passkey, single sign-on, invitations) ends with the app loading `auth/status`, so none of them needs a change, and sessions from before the upgrade get a key on their next load.
- The app stores the key in its local database (`meta`), next to the data it protects, so a sign-out or a wipe removes it with them.
- For a cookie found in `revoked_sessions`, `auth/status` answers `authenticated: false` plus `revoked: {proof}`, where proof is base64url(HMAC-SHA256(wipe key, `"opentodo device revoked v1"`)).
- The app recomputes the HMAC with Web Crypto under its stored key and compares. Only a match wipes.

A response from anything but this server (a proxy's error page, a captive portal, a page or extension that cannot read the app's IndexedDB) cannot produce the proof. A proof is tied to one session: once the device signs in again it holds a new key and an old proof no longer matches. The request is the app's own same-origin `fetch` with the session cookie; the proof never travels with anything another origin can read (`auth/status` sends no CORS headers). Someone who can read the server's database can forge a proof for a session it lists, but such a reader already controls the code the browser runs (`docs/security/limits.md`).

Rejected: a distinct 401 code on every route (`session_revoked`). It would need the proof on every response and two places in the client to act on it. Every 401 the sync loop sees already makes the app reload `auth/status`, which is the one place that decides.

### D4 — The wipe

`web/src/lib/revocation.ts` holds `rememberWipeKey(status)` and `revokedHere(status)`. `App.refresh` calls `revokedHere` on a signed-out status before anything else. On a match it runs `clearDeviceData()` (the sign-out clear: every IndexedDB table including the outbox and `meta` with the stored encryption key, the in-memory keys, the shared-file inbox, the badge, the cached profile, the native shell's data), then `api.logout()`, whose answer clears the cookie and sends `Clear-Site-Data: "cache"` for cached attachments and pictures. It shows the sign-in screen with the notice "This device was signed out and its data was removed." Other tabs learn it from `announceSignOut` and reload.

### D5 — Unsynced changes

They are lost: the session can no longer upload them and keeping them would defeat the wipe. The Sign out everywhere confirmation says other devices remove their copy when they next connect and lose what they have not synced; the Deactivate confirmation says the same of the person's devices.

### D6 — Native shells

The Android and iOS shells hold reminders, geofences, the widget snapshot and a key behind the biometrics. `clearLocalData` already clears them through the bridge (`forgetShellData` in `web/src/lib/shell.ts`) on sign-out, so the wipe clears them too. The shell's cookie is the web view's and is cleared by the logout answer. No shell change.

### D7 — Device-bound server state

- Push subscriptions reference their session with `ON DELETE CASCADE` and go with it.
- Device relay opt-ins (`relay_devices`) name their session but are not cascaded. After a revocation, the handler calls `relay.Store.DisableEnded`, which removes the opt-ins whose session no longer exists, closes their streams and records `relay.disabled` with reason `signed_out`.
- Calendar connections, issue connections and notification channels belong to the account, not a device, and stay (deletion removes them with the account).

### D8 — Offline devices

The wipe happens on next contact. A device that never connects again, or only after the year a revocation is kept, keeps its copy. `docs/security/limits.md` and the threat model say so.

### D9 — Interface budget

No new screen or control. The notice uses the sign-in screen's existing notice line (as after a password reset). Two confirmation texts change.

## Data model

Two additive tables, no op and no synced field: offline behaviour and convergence are unaffected (a wipe removes a local copy that the server still holds in full). No dependency, no effect on image size; memory unchanged; one row per revoked session for a year.

## Risks

- A device revoked by mistake loses its unsynced changes. The confirmation says so, and the server keeps all synced data.
- A device that lost its stored key (cleared site data) without signing out is not wiped; it has nothing left to wipe.
