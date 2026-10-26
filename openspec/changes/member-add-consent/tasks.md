Not started: this change stops at the proposal for review (see proposal "Why this stops at the proposal").

## 1. Server

- [ ] 1.1 Migration `member_invitations`; store test for cascade and the unique open invitation
- [ ] 1.2 Co-member check and the 202 path in `handleAddMember` (and the workspace route); `TestAddMemberAsksStrangers`, `TestAddMemberCoMemberImmediate`, `TestAddMemberSameAnswerForUnknown`
- [ ] 1.3 Invitee routes (list, accept, decline) and owner cancel; route policies, demo deny list, `policy_test.go`; `TestMemberInvitationAcceptDeclineStale`
- [ ] 1.4 Notify kind and email template (six languages); audit events in the catalogue and web filter list
- [ ] 1.5 Expiry sweep; existing 30-per-hour limit counts invitations

## 2. Clients

- [ ] 2.1 `web/src/lib/api.ts` handles 202; share dialog pending rows with Cancel; inbox item; Settings → Account → Invitations; strings; stories and baselines; `npm test`, `make ui-lint`, `make i18n-check`
- [ ] 2.2 `ot project share` prints the pending state; CLI test

## 3. Tests that relied on an immediate add

- [ ] 3.1 Test helpers that share between unrelated test accounts accept the invitation (or create a co-membership first); `go test ./...`

## 4. Docs

- [ ] 4.1 `docs/sharing.md`, `docs/api.md`, CHANGELOG (BREAKING API note for 202); `make openspec-validate`
