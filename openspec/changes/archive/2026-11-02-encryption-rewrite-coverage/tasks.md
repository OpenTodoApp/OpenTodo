# Tasks

## 1. Coverage

- [x] 1.1 Append `note`, `time_entry`, `rule`, `frame`, `slot`, `place` and `review` to `MIGRATION_ORDER` in `web/src/lib/e2eeSync.ts` and export it. Verify with `e2eeCoverage.test.ts` "lists every entity kind that has content fields" (`npm test`), which fails on the old list.
- [x] 1.2 Turning encryption on encrypts, and turning it off decrypts, the existing text of every kind. Verify with `e2eeCoverage.test.ts` (`npm test`).

## 2. Scope

- [x] 2.1 `personalResolver` resolves notes through their project and time entries through their task; the job skips other people's time entries. Verify with `e2eeCoverage.test.ts` "leaves notes and time entries of a shared project in plaintext" (`npm test`).

## 3. Catch-up

- [x] 3.1 Record the covered kinds after a complete run; `catchUpEncryption` runs the job once after a complete exchange when the list is short, writes back shared-scope ciphertext, and waits while locked. Verify with the catch-up tests in `e2eeCoverage.test.ts` (idempotent: a further sync writes nothing) and the existing `e2ee.test.ts`, `e2eeMigrationNotes.test.ts` and `attachments.test.ts` (`npm test`, `npm run build`).

## 4. Docs

- [x] 4.1 `docs/e2ee.md` lists every encrypted kind and the catch-up; CHANGELOG entries under Security and Fixed. Verify with `make docs-check`.
