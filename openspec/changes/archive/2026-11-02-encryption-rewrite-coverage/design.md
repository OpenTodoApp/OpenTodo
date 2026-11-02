# Design

## D1. One list, checked against the generated content fields

`MIGRATION_ORDER` stays a hand-kept array because a stored, interrupted job records its position as an index into it: new kinds are appended. `e2eeCoverage.test.ts` fails when a key of `OP_CONTENT_FIELDS` (generated from `Schema`) or `CONTENT_PREFIXES` is missing from it.

## D2. Catch-up keyed on the covered kinds

A completed run stores the list of kinds it covered under the meta key `e2ee.covered`. After an exchange that pulled everything and emptied the outbox, `catchUpEncryption` runs the job once more when that list lacks a current kind (or is absent), no job is stored, the device holds the key, and the key record is not missing. Running only after a complete exchange means the values re-written are the server's current winners, so a stale local value never overwrites a newer edit. The job's existing skip rule (the wire form recorded per field by `markSent` and `decryptIncoming`) leaves values the server already holds as ciphertext alone; a run that finds nothing writes nothing and still records the list. A kind added to the list in a later release triggers the same catch-up automatically, with no version number to bump.

Several devices may run it at once; each re-writes the same plaintext, and the values converge by last-writer-wins on equal text, as encrypt-on-sight already does. One run at a time per database: `runMigration` returns the running promise to a second caller.

## D3. Scope of notes and time entries

`personalResolver` resolves `note` through `project_id` and `time_entry` through `task_id` and then the task's `project_id`, matching `internal/sync/scope.go`. In encrypt mode the job also collects fields of non-personal rows whose server form is ciphertext and re-writes them; `prepareOutgoing` sends them as plaintext because the row is not personal.

## Data model and size

No op field, table or route changes. One meta key. The catch-up reads each content table once per device per change of the list, a page at a time (`Re-write job reads incrementally`). No dependency; the bundle grows by a few hundred bytes. No screen changes.
