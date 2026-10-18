# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/`.

## 1. Dependencies

- [x] 1.1 Bump `prosemirror-view` to 1.42.6 with `npm install --save-exact`; verify with `npm audit --omit=dev` (0 vulnerabilities), `richtext.test.ts`, `richtextEditor.test.ts`, `notes.test.ts`, `projectNotes.test.ts` and `projectNote.test.tsx`.

## 2. One entity registry

- [x] 2.1 Add `tableOf`/`syncedTables` to `web/src/lib/db.ts` and use them in `sharing.ts`, `ops.ts`, `undo.ts`, `e2eeSync.ts` and the re-seed in `sync.ts`; verify with `sync.test.ts` "re-seeds custom field definitions after a restore", "a refused custom field change is forgotten and takes the server value" and "a refused attachment is dropped without an error".

## 3. Link attachments and encryption

- [x] 3.1 Migrate personal link attachments by replacement when encryption is turned on or off; verify with `e2ee.test.ts` "enabling encrypts an existing link as a new attachment; disabling decrypts it again".

## 4. Sync answers

- [x] 4.1 Validate the sync answer before touching the outbox; verify with `sync.test.ts` "a 200 answer that is not a sync response keeps the queued edits".
- [x] 4.2 Delete the sent batch, hold limited ops and forget refused ones in one transaction before the locked check; verify with `e2ee.test.ts` "keeps changes a limit refused and forgets refused ones when the answer turns out locked".
- [x] 4.3 Add the new status message to every catalog; verify with `make i18n-check`.
