# Design

## Sync answer handling (DATA-1)

`runOnce` validates the answer (`ops` an array of objects, `cursor` a finite number, `hasMore` a boolean, `rejected`, `memberships` and `purged` arrays when present, every refusal with string `id` and `reason`). A failed check throws an ordinary `Error`, which the loop shows as the error state; nothing was deleted, so the next exchange sends the same batch (op ids make it idempotent on the server).

After a valid answer, one Dexie transaction over the entity tables, the outbox and meta deletes the sent batch, records the wire form (`markSent`), holds limit-refused ops (`holdOps`), forgets refused clocks (`forgetRejected`) and drops refused ops from the activity log. Everything in it is IndexedDB work only, so the transaction cannot commit early. Decryption (Web Crypto, which cannot run inside a transaction) and the locked check come after; on the locked path the rows that only existed here are dropped and the loop returns with the cursor unchanged, so the server's values for refused fields arrive after unlocking and win because their local clocks are gone.

## Entity registry (DATA-6, DATA-8)

`db.ts` exports `tableOf(entity)` and `syncedTables()`, backed by one object literal checked with `satisfies Record<Entity, Table<unknown, string>>`: a new entity kind does not compile until it has a table, and an unknown kind throws instead of falling back to tasks. It is rebuilt when `useDatabase` swaps the instance. `entityTables()` is `syncedTables()` plus the activity log. The copies in `sharing.ts`, `ops.ts`, `undo.ts`, `e2eeSync.ts` and the re-seed list in `sync.ts` are removed; `dropUnconfirmed` locks `syncedTables()`.

## Link attachments in the migration (DATA-5)

The server treats an attachment's `url`, `mime` and `encrypted` as fixed at creation, so a link cannot be re-written in place. `attachment` is appended to `MIGRATION_ORDER` (appended, so a stored job's index stays valid). Its pending rows are this account's live personal links whose url is not yet in the target form (`_e2ee.wire.url`); each batch creates a copy with a new id and tombstones the old link in one `mutateMany`, and marks the copy's wire form as the target so a resumed run skips it (`markSent` corrects it after upload). Files keep their own phase (attachments D8).

## Data model, size

No new fields or ops; `_e2ee` is local bookkeeping that already exists. `prosemirror-view` 1.41.0 → 1.42.6 grows the NotesEditor chunk from 222.80 kB (69.26 kB gzip) to 225.25 kB (70.09 kB gzip); the precache grows by 2.4 KiB. No server image or memory change. No screen changes; one new status message (translated in every shipped catalog).
