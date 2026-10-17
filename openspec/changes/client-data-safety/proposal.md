# Proposal

## Why

An audit of the web client's data layer (DATA-1, DATA-5, DATA-6, DATA-7, DATA-8) found ways the device can lose or leak data:

- A sync answer that is not a sync response (a proxy or captive portal page served with status 200, which `api.parse` turns into `{}`) emptied the outbox before anything was checked, and the edits were gone. When an answer turned out to need a key this device lacks (encryption enabled elsewhere), the sync loop returned after emptying the outbox but before holding the ops a server limit refused and before forgetting the clocks of refused ops.
- The entity-to-table map was copied five times. The copy in the restore re-seed lacked custom field definitions, so they were never sent back to a restored server; the copy used for refused ops fell back to the tasks table for a refused field definition (its clock was never forgotten, so the device kept a value the server refused), and the transaction that drops refused rows did not include attachments, so a refused attachment threw and the exchange failed.
- Turning end-to-end encryption on left existing link attachments (url and name) in plaintext on the server, and turning it off left them as ciphertext: neither the content migration nor the file phase handled links.
- `prosemirror-view` 1.41.0 has a published paste XSS advisory (GHSA-c8x8-7fp4-3x9w).

## What Changes

- The sync loop checks the shape of every answer before it touches the outbox; a malformed answer leaves the outbox, the cursor and the local data as they were and shows an error.
- The sent batch leaves the outbox in one transaction that also holds limit-refused ops and forgets the clocks of refused ops, before the encryption check can stop the exchange; the locked path also drops rows that only existed on the device and were refused.
- One typed registry in `web/src/lib/db.ts` maps every entity kind to its table (exhaustive, no fallback); the re-seed, refused-op handling, undo, the encryption hooks and `applyOps` use it, and the drop of refused rows locks every entity table.
- The encryption migration also handles personal link attachments: since the server fixes a link's url and mime at creation, each one is replaced by a new link in the account's new form and the old one goes to the Trash, like files.
- `prosemirror-view` is bumped to 1.42.6 (no other ProseMirror package needs a change: its peer ranges are satisfied).

No op schema, API or data model change; no new environment variable. Not **BREAKING**.

**Out of scope**: other DATA findings (clock skew, sign-out during sync, request timeouts, service worker updates, multi-tab coordination and the rest); encrypt-on-sight rewriting a link's url in place when plaintext arrives for an encrypted account (the server refuses it as immutable; noted for a follow-up). ROADMAP.md item advanced: none; this hardens existing behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `offline-first-sync`: added requirements for answers that are not sync responses, for handling refusals before the exchange can stop, and for covering every entity kind in the re-seed and in refusals.
- `end-to-end-encryption`: added a requirement for link attachments in the migration.
