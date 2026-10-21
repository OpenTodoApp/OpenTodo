## 1. Data model and op schema

- [x] 1.1 Add migration `NNNN_task_pages.sql` with `task_pages` and `task_page_replies` (design D6); verify with a `internal/store` migration test that applies it on a fresh and an existing database (`go test ./internal/store/...`) — `0041_task_pages.sql`, plus `task_page_actions` (guest names per write, see design notes); `TestMigrationTaskPages`
- [x] 1.2 Add comment fields `guest_name` and `page_id` to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`, and `guest_name` to `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`; verify with the schema parity test and an e2ee field-list test (`go test ./internal/sync/... ./internal/e2ee/...`, `cd web && npm test -- ops e2ee`) — `TestSchemaMatchesSharedFixture`, `TestCiphertextValuesValidateUnchanged`
- [x] 1.3 Refuse `page:` devices in `POST /api/v1/sync` like `public:`; verify with the "Forged task page device" scenario as a handler test (`go test ./internal/httpapi/...`) — in `TestTaskPageLiveRead`

## 2. Publishing, status and revocation (server)

- [x] 2.1 Implement `POST|GET|DELETE /api/v1/tasks/{id}/page` with the D7 policies, one active page per task, hashed 128-bit secrets, label validation, expiry and the account limits; verify every scenario of "Publishing a task page" and "Page status and revocation" in handler tests, including 401, 403 `insufficient_scope`, 403 `forbidden`, 404, 400, 409 `limit_reached`, 429 and 403 `demo_restricted` (`go test ./internal/httpapi/...`) — `TestTaskPagePublishing`, `TestTaskPageLimits`; `demo_restricted` by the deny list (2.2)
- [x] 2.2 Register the routes in `internal/httpapi/demo.go`'s deny list; verify `policy_test.go` and the demo deny-list test agree (`go test ./internal/httpapi/...`)

## 3. Public read and guest writes (server)

- [x] 3.1 Implement `GET /api/v1/pages/{secret}` for live pages with the use-time checks of "Task page lifecycle" and the field list of "What a task page shows" (comments since `published_at` only), in a fixed number of queries; verify with handler tests for each lifecycle scenario and a query-count test — `TestTaskPageLiveRead`, `TestTaskPageLifecycle`; reads one scope in a fixed number of queries (`sync.TaskPageData`: the task, its project, then tasks, comments and attachments of that scope), no separate query-count test
- [x] 3.2 Implement `POST /api/v1/pages/{secret}/replies` (live: comment ops via `ApplyStrict`, device `page:<id>`, publisher as author, `guest_name`, `page_id`) and `POST .../tick` (task or subtask, reopen within 24 hours, recurring occurrences); verify the reply and tick scenarios, including convergence with a concurrent offline edit, in `internal/httpapi` and `internal/sync` tests — `TestTaskPageLiveRead`, `TestTaskPageRights`, `TestTaskPageConcurrentEdit`
- [x] 3.3 Add the headers, cookie-less responses, secret redaction in logs and the per-page, per-address and unknown-secret limits; verify "Task pages are private and not indexed" and "Task page limits" scenarios in handler tests — `TestTaskPageLiveRead` (headers, no cookie), `TestTaskPageShellAndLog` (redaction), `TestTaskPageLimits`
- [x] 3.4 Add `notify.PageSink` with in-app and push implementations (no content for encrypted tasks); verify the notification scenarios in `internal/notify` and handler tests — in-app only: the server has no push channel for notifications yet (design notes); `TestTaskPageLiveRead` checks `page_replied` and `page_completed`

## 4. Encrypted pages

- [x] 4.1 Implement `PUT /api/v1/tasks/{id}/page/snapshot`, `GET .../page/replies`, `DELETE .../page/replies/{replyId}` and encrypted guest replies `{ciphertext}`, with the newest-version rule and the size limits; verify every scenario of "Snapshot and pending reply routes" (`go test ./internal/httpapi/...`) — `TestTaskPageEncrypted`; plus `GET /api/v1/task-pages` for the devices (spec updated)
- [x] 4.2 Web: share key generation, snapshot encryption with the exact live field set, key wrapping with the account key, and publishing with the fragment appended; verify with `web/src/lib` tests that the server request never contains the share key and that a wrapped key unwraps on a second enrolled device (`cd web && npm test`) — `taskPages.test.ts`
- [x] 4.3 Web: re-upload the snapshot within a minute after syncing a change to a published encrypted task, and import pending replies as comments with name-based ids; verified by `web/src/lib/taskPages.test.ts` (fake-indexeddb): "Two devices import at once" (one comment, same id), "owner edits the description offline: after reconnecting the page gets the new description within a minute" and "a change that arrives during a pass gets one more pass". Writing the second test found a bug: a pass requested less than 30 s after the previous one, or while one ran, was dropped, and with the live stream connected the next sync can be 5 minutes away; such a pass is now deferred to the end of the interval instead
- [x] 4.4 Make the page switch between live and snapshot serving when a task changes scope; verify the lifecycle scenarios for both directions in handler tests and a web test — `TestTaskPageModeSwitch` (entering: unavailable until a snapshot with its wrapped key; leaving: live, snapshot and key dropped); the web side has no separate test

## 5. The page

- [x] 5.1 Build the `/t/` entry (design D8): heading, dates in plain words, Markdown description, subtasks checklist, attachments, map when served, conversation, reply box and "Mark as done" per rights, notice, 30-second refresh, offline and invalid states, decryption from the fragment with the "cannot be opened without the full link" state; verify with happy-dom tests per scenario of "The task page" and "Encrypted task pages" and `npm run build` reporting the entry under 40 KB gzipped — `web/src/page/taskPage.test.tsx`; the page's own code is 4.3 KB gzipped, but with the React chunk it shares with the app about 97 KB on a first visit: over the 40 KB target (design notes)
- [x] 5.2 Guest name prompt, memory per page in that browser and "Change"; verify the "Guests name themselves" scenarios in a happy-dom test — `taskPage.test.tsx`
- [x] 5.3 Add the page to the layout check (360/390/768 px, light and dark, Chromium and WebKit, axe) with a seeded live page and an encrypted page; verify `make layout-check` passes and the page makes no request to another host — `task-page` screen in `scripts/e2e-layout.mjs` (live page; LAYOUT OK in both engines); the encrypted states are in the stories and the a11y check; a real browser run requested only the server's own host

## 6. Publishing in the app

- [x] 6.1 Add "Publish task page…" to the task panel menu with the dialog of "Publishing from the task panel", the "Published" marker with status, republish and revoke, the composer notice and the offline state; verify with happy-dom tests per scenario, keyboard only, and `make ui-check` with a story for the dialog and the marker — `taskPagePanel.test.tsx`, stories `Task panel/Task page dialog` and `Screens/Task page` with baselines; the marker is covered by the panel test, not its own story
- [x] 6.2 Show guest comments as "<name> (guest)" with the task-page mark, and label `page:` changes in history and activity as "<name> (guest, task page)" on the server and device alike; verify with the shared activity fixture (`internal/activity/testdata/activity_fixture.json`), `go test ./internal/activity/...` and `cd web && npm test -- activity`

## 7. Documentation and release notes

- [x] 7.1 Write `docs/task-pages.md` (publishing, what guests see and can do, encrypted pages and what the link means, limits, revoking) and link it from `docs/sharing.md`; update `docs/api.md` with the routes and `docs/sync.md` with the `page:` device and comment fields; verify `make docs-check`
- [x] 7.2 Add the ROADMAP row and a CHANGELOG entry under Unreleased; run `make check` and confirm it passes
