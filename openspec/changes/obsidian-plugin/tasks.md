# Tasks

Depends on `obsidian-origin` being merged (the server must accept the kind). Server tasks run `go test ./...`; web tasks `npm test` and `npm run build` in `web/`; plugin tasks `make obsidian` (type-check, unit tests with vitest and a mocked `obsidian` module, the build and the size budget). `make check` runs before the last task is ticked.

## 1. Server: push-only exchange

- [ ] 1.1 `internal/httpapi/sync_handlers.go`: when `features` holds `push_only`, apply as today, skip the pull, answer with the head cursor (`sync.Service` gains a cheap `Head(uid)`), `hasMore: false` and empty `ops`, `memberships`, `workspaces`. Verified by `go test ./internal/httpapi/...`: a push-only creation on an account with existing history returns no ops and the head cursor; a repeat counts duplicates; a viewer's op is listed as refused; no session is 401 and a `read` token 403 `insufficient_scope`; the other devices' event stream receives a wake-up.
- [ ] 1.2 `docs/api.md` and `docs/sync.md` document `push_only`. Verified by `npm run docs:check`.

## 2. Shared code

- [ ] 2.1 Move the envelope functions (encrypt, decrypt, key derivation and unwrap of the key record) from `web/src/lib/e2ee.ts` into `web/src/lib/e2eeEnvelope.ts` with no import of `db`, `api`, `shell` or `i18n`; `e2ee.ts` re-exports what the app uses. Verified by `web/src/lib/e2ee.test.ts` still passing on `e2ee.vectors.json`, a new test that `e2eeEnvelope.ts` imports nothing outside itself and `crypto.subtle`, and `npm run build` with an unchanged bundle size (`make bundle-budget`).
- [ ] 2.2 TypeScript task-line grammar `obsidian/src/vault/line.ts` (parse and print one line, the field order of `markdown-vault` "Task lines"), ported from `internal/vault/line.go`. Generate `internal/vault/testdata/lines.vectors.json` from the Go parser (one entry per field kind, unknown text kept, refused dates and times reported) and run it in Go (`internal/vault`) and TypeScript (`obsidian/src/vault/line.test.ts`); the TS test also parses every task line of the fixture vault to the tasks recorded in `expected.json`. Verified by `go test ./internal/vault/...` and `make obsidian`.

## 3. Plugin skeleton and connection

- [ ] 3.1 `obsidian/`: `manifest.json` (id `opentodo`, `isDesktopOnly: false`, `minAppVersion` set to the oldest version the tests ran against), `package.json` with `obsidian` and `esbuild` as pinned dev dependencies, `esbuild.config.mjs`, `src/main.ts`, `styles.css`, `README.md` (what it does, network use, `full` token, no data collected), `LICENSE` (AGPL-3.0-only). `make obsidian` type-checks, tests, builds and fails above 250 KB for `main.js` or when the bundle references a Node or Electron module. Verified by `make obsidian` and a test that greps the bundle for `require("fs")`, `require("electron")` and `child_process`.
- [ ] 3.2 Settings tab: address (shell address rules), token (stored with `App.saveLocalStorage`, never in `data.json`), Connect (health route, minimum version, `GET /api/v1/me`, token scope check), Disconnect (deletes token, caches, remembered key), status line (account, server version, encryption, waiting count), default project, "After sending", "Send without asking". Verified by unit tests with a mocked `requestUrl`: the five scenarios of "The plugin connects to the user's server only", and a test that `saveData` is never called with the token.
- [ ] 3.3 Project and label cache (`GET /api/v1/projects`, `GET /api/v1/labels`, names decrypted when encrypted, refreshed at most every five minutes and on demand, viewer projects excluded). Verified by unit tests (offline sheet uses the cached list; viewer project not offered).

## 4. Sending

- [ ] 4.1 The command, context-menu entry and mobile toolbar action; line or selection (≤ 50 non-empty lines); checkbox lines through `line.ts`, others through `web/src/lib/nlp` with the account's quick-add language; `🆔` or `[opentodo:: …]` lines refused with "Open in OpenTodo". Verified by unit tests for each scenario of "Send a line or a selection to OpenTodo".
- [ ] 4.2 Confirmation sheet (title, removable chips, project combobox, per-line checkboxes for a selection; Enter sends, Escape cancels, focus order tested). Verified by a happy-dom test driving the modal with the keyboard only.
- [ ] 4.3 Op builder: task creation ops (and the time-entry op for quick add's spent time), ids from `crypto.randomUUID`, HLC following the last `serverTime`, device `obsidian:<install id>` (install id made once per device, kept in per-device storage), origin of kind `obsidian` from the vault name and note path. Verified by unit tests that the ops validate against `web/src/generated/opSchema` and that the origin matches `obsidian-origin`'s vectors.
- [ ] 4.4 After sending: link field (default), mark done, or remove; Undo for ten seconds (restores the line, queues a trash op). Verified by unit tests on an in-memory editor.
- [ ] 4.5 Rename handling (`vault.on('rename')`) and "Fix OpenTodo links in this note". Verified by unit tests: a rename re-points the origins of the linked tasks; the fix command does the same from the note's lines.

## 5. Outbox, offline and encryption

- [ ] 5.1 Per-device outbox: queued before the line changes; pushed on load, on `online`, every 60 s while non-empty and by "Send pending to OpenTodo", with `features: ["push_only", "clock_skew"]`; refused ops dropped and reported; a non-`push_only` answer (older server) discarded. Verified by unit tests: offline send then reconnect, interrupted push repeated once, refused op reported with the note path.
- [ ] 5.2 Encrypted accounts: key record from `GET /api/v1/encryption/keys`, passphrase modal, in-memory key, "Remember on this device", refusal while locked, content fields encrypted before queueing. Verified by a unit test that the pushed title and origin are envelopes that `e2eeEnvelope.ts` decrypts back, and that a locked send queues nothing.
- [ ] 5.3 End-to-end check against a real server: `obsidian/e2e.test.ts` starts `./bin/opentodo` on a temporary data directory, connects with a `full` token, sends one line from a fake vault and reads the task back over REST with its `obsidian` origin; repeated for an encrypted account. Verified by `make obsidian-e2e` (run in CI next to the extension's tests).

## 6. Strings, docs, CI

- [ ] 6.1 Plugin strings in `obsidian/locales/{en,de,fr,es,it,pt}.json`, following Obsidian's language, checked by `scripts/i18n` like the extension's. Verified by `make i18n-check`.
- [ ] 6.2 The web app's API tokens section gains the hint "For the Obsidian plugin, create a full token named after the device" in six languages. Verified by `make i18n-check` and the settings story in `make ui-check`.
- [ ] 6.3 `docs/obsidian.md` (install from the directory or by hand, connect, send, what happens to the line, offline, encrypted accounts, how it differs from `ot vault`), linked from `docs/vault.md` and `docs/capture.md`. Verified by `npm run docs:check`.
- [ ] 6.4 CI: an `obsidian` job for changes under `obsidian/**`, `web/src/lib/nlp/**`, `web/src/lib/e2eeEnvelope.ts` and `internal/vault/testdata/**`, and on tags a step that pushes the built files to the release repository and creates the release (skipped with a warning when its deploy key secret is absent). Verified by `scripts/repo-checks.test.mjs` covering the path filter, and the first tag run.
- [ ] 6.5 CHANGELOG entry under Unreleased (at archive). Verified by `make check`.
- [ ] 6.6 Owner actions recorded in `obsidian/README.md`: create the release repository and its deploy key, submit to `obsidianmd/obsidian-releases`. Verified by the README listing them.
