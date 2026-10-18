# Encryption state integrity and a stricter share target

## Why

The audit (DATA-4, DATA-20, DATA-22, DATA-19) found that the server could steer a device's end-to-end encryption, and that the share target took any POST:

- When the server answered 404 for the key record, the device turned encryption off by itself. A server restored from a backup made before encryption was enabled then got the device's whole re-seed in plaintext; a hostile server could do the same on purpose.
- The PBKDF2 iteration count of the key record came from the server unchecked: a tiny count makes the stored wrap cheap to attack, a huge one hangs the device.
- The service worker stored every `POST /share`, also from forms on other sites, of any size.
- A ciphertext is bound to its entity, id and field but not to a version, so the server can serve an older ciphertext of the same field. This is not fixable without a design change and was not documented.

## What Changes

- Only an explicit action on the device turns encryption off. A missing key record on the server marks the device "record missing": sync stops (state Locked), nothing is uploaded or re-seeded, and a screen offers to restore the key record from this device (the cached copy, uploaded as a new version-1 record; a device without the key enters the passphrase first), to turn encryption off on this device, or to sign out. Translated in all shipped languages.
- Key records with an iteration count outside 100,000–10,000,000 are not used or cached; a device without the key stays locked with a clear error.
- The service worker takes `POST /share` only with `Sec-Fetch-Site: none` or `same-origin` (or no such header, for older browsers) and only up to 100 MB in total; anything else redirects to the app without storing.
- `docs/e2ee.md` documents ciphertext rollback in the threat model.

Not **BREAKING** for data or API. Behaviour change: when another device turns encryption off, the other devices no longer follow silently; each asks once.

## Out of scope

- Binding ciphertexts to a version or detecting rollback (DATA-19 is documentation only).
- Server-side changes: the existing `PUT /api/v1/encryption/keys` already accepts a version-1 record when none exists.

## Impact

- Changed: `web/src/lib/e2ee.ts`, `e2eeSync.ts`, `sync.ts`, `crypto.ts`, `shareInbox.ts`, `web/src/sw.ts`, `web/src/app/UnlockScreen.tsx`, `App.tsx`, catalogs in `web/src/locales/`, tests beside them, `docs/e2ee.md`, `docs/capture.md`, `CHANGELOG.md`.
- No dependency, op schema, migration or Go change. Bundle impact: a few hundred bytes of code and the new messages.
