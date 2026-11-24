# Tasks

Backend tasks run `go test ./...`; frontend tasks run `npm test` and `npm run build` in `web/`. `make check` runs before the last task.

## 1. Op schema

- [x] 1.1 Declare `user_prefs.focus_run` (`kString`, default `""`, not content) in `internal/sync/ops.go` `Schema` and regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. Verified by `TestFocusRunConverges` in `internal/sync/userprefs_test.go` (a record applies, the later of two offline writes wins whatever the arrival order, another account never sees it).
- [x] 1.2 The importer drops `focus_run` from imported preferences, and a server backup restore resets it. Verified by `internal/importer/userprefs_test.go` and `TestRestoreForgetsFocusSession` in `internal/backup`.

## 2. Web: shared record

- [x] 2.1 `web/src/lib/focus/state.ts`: `writeFocus` and `transitionFocus` give the row a new `rev`, clear `remote` and write the record through `mutate('user_prefs', 'me', { focus_run })` in the same transaction, unless called with `{ local: true }`; `adoptRun` re-reads the stored record in its transaction and adopts it when its rev is not the row's, keeping the device-only fields; `parseRun` ignores what it cannot read. Verified by `web/src/lib/focus/sync.test.ts` (start on A shows on B through applied ops, pause and resume math across devices, stop, the device's own record is not adopted, a newer client's value is ignored and kept, a remote record arriving during a local write leaves the row on the stored record).
- [x] 2.2 `web/src/lib/focus/session.ts`: the end of a timed run, "Entry stopped elsewhere", completion elsewhere and "Not now" are local only; an auto-started work phase attaches its entry on the owning device only, after a pull and only while the stored record is its own; adopting a record ends the entry of a replaced running stretch; every Focus time is `serverNow()`; `timeTrackingLogger.running` reads a missing entry as running. Verified by `sync.test.ts` (an ended run writes no `focus_run` op on either device; pausing on B stops A's entry; a pause before the entry arrived ends it on adoption; a slept laptop adopts the newer session instead of writing; clocks 3 minutes off either way; two offline starts converge on the later one).
- [x] 2.3 `useFocusTimer` adopts the preferences row's record, and the sound, the notification, the noise, the break reminder and the shell publication run on the owning device only. Verified by `web/src/app/focus/useFocusTimer.test.tsx` (an adopted end plays no tone and shows no notification) and the existing focus tests.

## 3. Documentation

- [x] 3.1 `docs/focus-devices.md` (new: the session on every device, which device rings, linked from `docs/focus.md`), `docs/focus-elsewhere.md`, `docs/sync.md` (the `focus_run` row). Verified by `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/sync-focus-sessions.md`. Verified by `make repo-check`.
- [x] 3.3 `make check` passes.
