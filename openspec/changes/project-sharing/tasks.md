# Tasks

## 1. Storage and scopes

- [x] 1.1 Add `internal/store/migrations/0002_sharing.sql`: `scope_id` on `ops` with backfill and indexes, rebuilt `fields` keyed by scope, `project_scopes` and `project_members` tables; verify `TestMigrateSharingBackfillsPersonalScopes` (existing rows end with `user:<id>`) via `go test ./...`
- [x] 1.2 Scope resolution in `internal/sync`: personal vs project scope for `project` and `task` ops, batch-local `project_id` lookup, `scope_change` refusal; verify `TestScopeResolutionForNewAndExistingTasks`, `TestProjectIdAcrossScopesIsRejected` via `go test ./...`
- [x] 1.3 First-share relabel transaction (project + its tasks move to `project:<id>`); verify `TestShareRelabelsExistingOpsAndFields` checks `seq` and `op_id` are unchanged via `go test ./...`

## 2. Authorization in the sync engine

- [x] 2.1 Role table (viewer/editor/admin/owner × entity/field) and per-op evaluation at receipt time in `Apply`, returning `rejected: [{id, reason}]` without failing the batch; verify `TestViewerWritesAreRejectedPerOp`, `TestEditorCannotEditProjectFields`, `TestRejectionIsIdempotentOnRetry` via `go test ./...`
- [x] 2.2 Include the current winning op for each refused field in the same response; verify `TestRejectedFieldsComeBackWithServerValue` via `go test ./...`
- [ ] 2.3 `Pull` over the caller's scopes, backfill replay for new memberships with monotonic cursor and `hasMore`, `memberships` in every response; verify `TestPullIsScopedToMemberships`, `TestNewMemberReplaysHistoryBehindCursor`, `TestRemovedMemberReceivesNothing` via `go test ./...`

## 3. Membership REST routes

- [ ] 3.1 Handlers for list/add/change-role/remove/leave/transfer behind `requireAuth`, 404 for non-members, `user_not_found`, `owner_must_transfer`, `forbidden` envelopes; verify `TestMembershipRoutesAuthAndErrors`, `TestOwnerTransferDemotesPreviousOwner` via `go test ./...`
- [ ] 3.2 Collection, get, patch, delete and export include shared scopes with role enforcement and `role`/`owner_id` on shared projects; verify `TestRestReadsUnionScopes`, `TestExportIncludesSharedProjects`, `TestRestPatchByViewerIsForbidden` via `go test ./...`
- [ ] 3.3 Document routes, error codes, scopes, rejections and catch-up in `docs/api.md` and `docs/sync.md`; verify the documented payloads match `TestMembershipRoutesAuthAndErrors` fixtures and `make check` passes

## 4. Client data layer

- [ ] 4.1 `memberships` table in the local database, types for role and membership, sync loop stores `memberships` from every response and purges projects/tasks of scopes no longer listed; verify `sync.test.ts` cases "stores memberships" and "purges removed project locally" via `npm test`
- [ ] 4.2 Rejection handling: drop outbox rows for `rejected` ids, clear the field clock and apply the server value, surface a notice with counts; verify `sync.test.ts` case "rejected op restores server value" via `npm test`
- [ ] 4.3 Cross-scope move as copy + tombstone and owner delete of a shared project (tombstones plus Inbox copies) in `ops.ts`; verify `ops.test.ts` cases "move across scopes creates copy and tombstone" and "delete shared project copies open tasks to Inbox" via `npm test`

## 5. Client UI

- [ ] 5.1 Shared badge in the sidebar, member list and roles in the project header, read-only rendering for viewers from cached membership (works offline); verify in the browser flow that a viewer offline sees disabled quick add and a read-only notice, and `npm run build` succeeds
- [ ] 5.2 Share dialog (email + role), role change, remove, leave, transfer, all keyboard reachable with a shortcut listed in `?`; verify browser flow: share with a second account, second account receives the project within one sync, and `npm run build` succeeds
- [ ] 5.3 Rejected-changes notice naming the project and affected tasks; verify browser flow: downgrade an editor to viewer while offline, reconnect, notice appears and values revert

## 6. Integration and docs

- [ ] 6.1 Two-account end-to-end run: share → member catches up → concurrent offline edits converge → downgrade while offline → removal purges locally → owner transfer → delete with Inbox copies; verify the run finishes with no console errors and `make check` passes
- [ ] 6.2 Update `README.md` feature list, `docs/architecture.md` (scopes), `CHANGELOG.md` Unreleased; verify links resolve and `openspec validate --all --strict` passes
