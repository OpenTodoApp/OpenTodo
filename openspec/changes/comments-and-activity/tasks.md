# Tasks

Prerequisites: `project-sharing` and `task-assignment` are archived.

## 1. Comment entity (server)

- [ ] 1.1 Add the `comment` entity and fields to the op schema, scope resolution via `task_id`, and the `docs/sync.md` schema table; verify `TestValidateCommentOps` and `TestCommentScopeFollowsTask` via `go test ./...`
- [ ] 1.2 Authorship and role checks per op at receipt (author equals submitter, edit by author only, delete by author/admin/owner, viewer may create), mention filtering to current members; verify `TestCommentForgedAuthorIsRejected`, `TestCommentEditByOtherIsForbidden`, `TestAdminCanDeleteComment`, `TestMentionsFilteredToMembers` via `go test ./...`
- [ ] 1.3 Mention notifications through the notification sink after commit, with per-account creation rate limit; verify `TestMentionNotifiesMember` and `TestCommentRateLimit` via `go test ./...`
- [ ] 1.4 Comment REST routes (`GET/POST /tasks/{id}/comments`, `PATCH/DELETE /comments/{id}`) behind `requireAuth`, write-through, 404 outside scopes; verify `TestCommentRoutesAuthAndScope` via `go test ./...`

## 2. Activity derivation (server)

- [ ] 2.1 `actor` on served ops, ignored on input; verify `TestPullIncludesActorAndIgnoresClientValue` via `go test ./...`
- [ ] 2.2 `internal/activity`: fold-and-classify rule with old values, shared fixture `testdata/activity_fixture.json`; verify `TestActivityFixture` via `go test ./...`
- [ ] 2.3 `GET /tasks/{id}/activity` and `GET /projects/{id}/activity` with `seq` cursor pagination and scope checks; verify `TestActivityRoutesAuthScopeAndPagination` via `go test ./...`
- [ ] 2.4 Document entity, `actor`, routes and error codes in `docs/api.md` and `docs/sync.md`; verify examples match handler payloads and `make check` passes

## 3. Client data layer

- [ ] 3.1 `comment` types and op defaults, `comments` table, thread ordering helper, comment count per task; verify `ops.test.ts` cases "creates comment ops in task scope" and "thread order with deleted parent" via `npm test`
- [ ] 3.2 `activity.ts` implementing the shared rule against the same fixture, `activity` table with 500-event bound per project, folding of pulled and pending ops; verify `activity.test.ts` cases "matches shared fixture", "pending ops marked", "retention drops oldest" via `npm test`
- [ ] 3.3 Markdown renderer selection or in-house subset with sanitisation and hostile-input tests; verify `markdown.test.ts` cases "script tag is text", "link opens new tab with noopener", and bundle delta ≤ 10 KB gzipped reported in `npm run build` output

## 4. Client UI

- [ ] 4.1 Comment thread in task detail: composer with mention completion from the membership cache, reply, edit, delete, "edited" marker, deleted placeholder, keyboard shortcuts listed in `?`; verify browser flow: comment offline, reconnect, second account sees it threaded; `npm run build` succeeds
- [ ] 4.2 Activity in task detail interleaved with comments, pending marker, "load older" from REST; verify browser flow: offline detail shows local events, online loads older without duplicates
- [ ] 4.3 Project activity tab with actor and kind filters; verify browser flow: three accounts' changes listed newest first and the actor filter works with the keyboard; `npm run build` succeeds

## 5. Integration and docs

- [ ] 5.1 End-to-end run with two accounts: comment, reply, mention notification, edit by author, edit by other rejected with notice, delete by admin, activity per task and per project, history on a freshly joined device; verify the run finishes with no console errors and `make check` passes
- [ ] 5.2 Update `README.md`, `docs/architecture.md` (activity derivation), `CHANGELOG.md` Unreleased; verify `openspec validate --all --strict` passes
