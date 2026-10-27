## 1. Server

- [ ] 1.1 Migration `0049_member_invitations.sql` and `internal/auth/memberinvitations.go` (create, list, answer, cancel, prune, deactivation); `TestMemberInvitationStore` in `internal/auth`
- [ ] 1.2 "Already acquainted" check in `internal/sync`; the 202 path in `handleAddMember` and `handleAddWorkspaceMember`; `TestAddMemberAsksStrangers`, `TestAddMemberCoMemberImmediate`, `TestAddMemberSameAnswerForUnknown`, `TestWorkspaceAddAsksStrangers`
- [ ] 1.3 Invitee routes (list, accept, decline) and owner cancel; pending lists for managers; route policies, demo deny list, `policy_test.go`; `TestMemberInvitationAcceptDeclineStale`
- [ ] 1.4 Notify kind `member_invitation` (`notify.InvitationSink`), read on answer; email kind and template in six languages (`internal/mail` tests); audit events in the catalogue, `docs/api.md` and the web filter list (`internal/audit` tests)
- [ ] 1.5 Expiry prune on the hourly pruner and the host scheduler; the 50-open cap; the existing 30-per-hour limit counts invitations; `go test ./...`

## 2. Web

- [ ] 2.1 `web/src/lib/api.ts` and `workspaceApi.ts` handle 202, list, accept, decline and cancel; the client refreshes notifications on a membership wake-up; `npm test`
- [ ] 2.2 Share dialog and workspace members: pending rows with Cancel and the invitation note; notification item with Accept and Decline; Settings → Account → Invitations; strings in six languages; stories; `npm test`, `npm run build`, `make ui-lint`, `make i18n-check`

## 3. Tests that relied on an immediate add

- [ ] 3.1 Test helpers that share between unrelated test accounts accept the invitation; the route matrix's viewer setup; `go test ./...` and `go test -race` on the touched packages

## 4. Docs

- [ ] 4.1 `docs/sharing.md`, `docs/workspaces.md`, `docs/api.md` (202, routes, audit events; the API docs test), CHANGELOG `### Security` and `### Changed` with an upgrade note; `make openspec-validate`, `make docs-check`, `make repo-check`
