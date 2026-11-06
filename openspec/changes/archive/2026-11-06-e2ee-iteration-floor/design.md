# Design: key records need the iterations the app writes

## Context

`checkRecordParams` (`web/src/lib/crypto.ts`) refuses a key record whose iteration count is outside `ITERATION_LIMITS` before deriving anything. The range was 100,000 to 10,000,000. The app writes 600,000 (`PBKDF2_ITERATIONS`); the server's `e2ee.KeyRecord.Validate` refuses to store anything outside 600,000 to 10,000,000; `ot` (`internal/e2ee/crypt`) copied the device's 100,000.

## Decisions

### D1 — A hard floor, no upgrade step

The question was whether some account could hold a record between 100,000 and 599,999, which would lock it out after this change and would need a rewrap on the next unlock instead.

No such record can exist:

- The server's floor of 600,000 was added in the commit that introduced the key record (`7abc9338e`, before v0.1.0), and `PUT /api/v1/encryption/keys` is the only statement that writes `encryption_keys` (`internal/e2ee/keys.go`).
- Only the web app writes key records (the Obsidian plugin bundles the same `crypto.ts`; `ot` only reads them), always with `PBKDF2_ITERATIONS`, which has been 600,000 since the first commit of `crypto.ts`. The `iterations` option of `createKeyRecord` is passed only by tests.
- Backups and restores copy the database file, so they hold records the server accepted. No importer writes key records.

So the floor rises to the count the app writes, with no rewrap path. An upgrade-on-unlock would be dead code for records that cannot occur, and it would let a server keep serving a weak record until the next unlock.

### D2 — One named range

`ACCEPTED_ITERATIONS` is a frozen `{min: PBKDF2_ITERATIONS, max: 10_000_000}`. `ITERATION_LIMITS` stays a mutable copy so tests can derive keys with 1,000 iterations, and the tests that lower it now restore it from `ACCEPTED_ITERATIONS` rather than a literal. A test pins `ACCEPTED_ITERATIONS` to `{600000, 10000000}` and its floor to `PBKDF2_ITERATIONS`; `TestPassphraseAndRecoveryVectors` pins `crypt.MinIterations`/`MaxIterations` to `e2ee.MinIterations`/`MaxIterations`, so the three can no longer drift apart.

## Data model

None.

## Size

A few bytes of the first load; no dependency.

## Risks

- A record served by a modified or very old third-party server with fewer iterations now locks the device with the existing named error. That is the intended outcome.
