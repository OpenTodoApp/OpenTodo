# Tasks

Prerequisite: `project-sharing` is archived (scopes, memberships, per-op rejection).

## 1. Schema and validation (server)

- [ ] 1.1 Add `assignee_id` (nullable string) to the op schema in `internal/sync/ops.go` and to `docs/sync.md`; verify `TestValidateAcceptsAssigneeId` via `go test ./...`
- [ ] 1.2 Membership validation of non-null assignments at receipt time with `not_a_member` rejections and server value echo; verify `TestAssignToNonMemberIsRejected`, `TestPersonalTaskAssigneeMustBeOwner`, `TestViewerAssignmentIsForbidden` via `go test ./...`
- [ ] 1.3 Unassign on remove/leave in the same transaction, as `device="server"` ops; verify `TestRemovingMemberUnassignsTheirTasks` and `TestOfflineAssignmentToDepartedMemberConverges` via `go test ./...`

## 2. Notification hook (server)

- [ ] 2.1 `internal/notify` sink interface, post-commit emission from `Apply` when `assignee != author`, in-app sink writing `notifications`; migration `0003_assignment.sql`; verify `TestAssignmentEmitsNotificationAfterCommit` via `go test ./...`
- [ ] 2.2 `GET /api/v1/notifications` and `POST /api/v1/notifications/{id}/read` behind `requireAuth`, 404 for other users' rows, start-up retention sweep; verify `TestNotificationRoutesAuthAndOwnership` via `go test ./...`
- [ ] 2.3 Document field, rejection reason and routes in `docs/api.md`; verify examples match handler payloads and `make check` passes

## 3. Client data layer

- [ ] 3.1 Add `assignee_id` to `types.ts`, op defaults in `ops.ts`, and the local task index; verify `ops.test.ts` case "new task defaults assignee_id to null" via `npm test`
- [ ] 3.2 Cross-scope copy clears the assignee when not a member of the destination; verify `ops.test.ts` case "copy across scopes drops non-member assignee" via `npm test`
- [ ] 3.3 Notification cache table and fetch on sync, unread count store; verify `sync.test.ts` case "caches notifications and counts unread" via `npm test`

## 4. Client UI

- [ ] 4.1 Assignee picker in the detail panel from the local membership cache, `a` shortcut, assignee chip on task rows in shared projects; verify browser flow: assign offline, reconnect, second account sees the assignee; `npm run build` succeeds
- [ ] 4.2 "Assigned to me" view grouped by project with sidebar count and `g a` shortcut, listed in `?`; verify browser flow: view lists tasks offline and completing one updates the count; `npm run build` succeeds
- [ ] 4.3 Notification badge and list, mark read on opening the task; verify browser flow: assignee sees the unread notification after sync and it clears on open

## 5. Integration and docs

- [ ] 5.1 Two-account end-to-end run: assign → notification → remove member → tasks unassigned on both devices → offline assignment to departed member rejected with notice; verify the run finishes with no console errors and `make check` passes
- [ ] 5.2 Update `README.md`, `docs/architecture.md` (notify sink), `CHANGELOG.md` Unreleased; verify `openspec validate --all --strict` passes
