# Design

## D1. "Record missing" instead of disabling

`refreshFromServer` keeps adopting a record it receives. A 404 on a device that encrypts sets `e2ee.recordMissing` in `meta` (and `recordMissing` in the snapshot) and changes nothing else: the key, the cached record and `e2ee.enabled` stay. `syncBlocked()` (enabled and either no key or record missing) replaces the "enabled and no key" test in `runOnce` and `reconcileMode`; `prepareOutgoing` throws `LockedError` while the record is missing, so even an op queued by any other path cannot leave in plaintext or under a record the server does not have.

`setEnabled` (record received, or explicit turn-off) clears the flag. Explicit turn-off paths: Settings → Turn off encryption (`disableEncryption`, unchanged), the "both lost" path (`disableWithoutKey`, unchanged) and the new `turnOffAfterMissingRecord` on the record-missing screen (local only: there is no record to delete, and `DELETE` would require a fresh sign-in for nothing).

Alternative rejected: telling a legitimate remote disable from a rollback. The server is the only witness, so the device cannot; it asks the user once.

## D2. Restoring the key record

The server's `PUT /api/v1/encryption/keys` creates a record when none exists with version 1 and no fresh sign-in. `restoreKeyRecord` sends the cached record with `version: 1` (createdAt/updatedAt dropped). It wraps the same account key, so all devices keep decrypting with the same passphrase; devices whose stored key belongs to a different `createdAt` lock and unlock once with the same passphrase (existing rule). A device without the key proves the passphrase against the cached record first (throttled like unlock). A 409 means another device restored first: its record is adopted.

## D3. Re-seed after a server restore waits

Before re-seeding after a generation change, an encrypted device re-reads the key record. If it is missing, the exchange ends Locked without adopting the generation, so the re-seed runs after the user decides. `reseedAfterRestore` itself refuses (`LockedError`) while sync is blocked.

## D4. Iteration bounds

`checkRecordParams` (crypto.ts) accepts integer counts in [100,000, 10,000,000]; the server already stores only 600,000 and up. `unlockWithPassphrase` checks it; `refreshFromServer` checks before adopting or caching, marks the account as encrypting (so a keyless device stays locked) and throws `KeyRecordParamsError`, which `unlock` surfaces instead of falling back to the cached record. `ITERATION_LIMITS` is a mutable object only so tests can derive with 1,000 iterations.

## D5. Share target

`shareRequestAllowed(headers)` and `entrySize(entry)` in `shareInbox.ts` (unit-tested; the service worker has no harness). The cap is 100 MB per share: several files at the server's default 25 MB per-file limit; the capture screen still applies the server's per-file limit.
