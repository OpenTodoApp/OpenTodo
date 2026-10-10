# Tasks

## 1. Server: storage and authorization

- [x] 1.1 Add the migration `internal/store/migrations/NNNN_user_management.sql`, using the next free number at merge time (provisionally `0003`). It adds `users.deactivated_at`, `users.last_login_at`, the `password_resets` table with an index on `user_id`, and the partial unique index `users_one_owner`. Verify that `go test ./internal/store/...` opens an empty data directory and an existing directory, both reach the new `user_version`, and inserting a second `owner` row fails.
- [x] 1.2 Add `auth.Authorize(actor, action, target)` with the D1 matrix, the errors `ErrForbidden`, `ErrSelfAction`, `ErrAccountDeactivated` and `ErrAccountActive`, and make `CanInvite` delegate to it so admins may invite. Verify with the table-driven `TestAuthorizeMatrix`, covering every role, action and target combination, under `go test ./...`.
- [x] 1.3 Change `Authenticate` to return `ErrAccountDeactivated` only after a correct password and to set `last_login_at` on success. Make `UserBySession` and `UserByToken` exclude deactivated accounts. Verify with `TestLoginDeactivatedCorrectPassword`, `TestLoginDeactivatedWrongPasswordIsUniform` and `TestLastLoginRecorded` under `go test ./...`.

## 2. Server: service operations

- [x] 2.1 Add `ListUsers` with derived status and no secret fields. Verify with `TestListUsersIncludesInvitedAccount`: an invitation is accepted, then the list shows a `member` that is `active` with `lastLoginAt` set.
- [x] 2.2 Add `SetRole`, owner only, `admin` ↔ `member`, with the single-owner assertion in the transaction. Verify with `TestSetRolePromoteDemote`, `TestSetRoleRejectsOwnerValue` and `TestSetRoleSelf` under `go test ./...`.
- [x] 2.3 Add `Deactivate` and `Reactivate` as one transaction each, per D3: sessions, tokens, pending invitations and reset links are revoked, and data is kept. Verify with `TestDeactivateRevokesEverything`, which checks that session and token rows are gone, the invitation is `revoked` and ops are unchanged, and with `TestReactivateDoesNotRestoreTokens`.
- [x] 2.4 Add `notifier.CloseUser(userID)` and call it after deactivation and deletion. Verify with the httptest case `TestDeactivationClosesEventStream`: an open `/api/v1/sync/events` stream ends within 5 s and reconnecting gives 401.
- [x] 2.5 Add `DeleteUser`, which deletes ops, fields and the user row (cascading) in one transaction and leaves an empty `beforeDelete` hook for `project-sharing`. Verify with `TestDeleteUserRemovesOnlyTheirData`, which checks that a second user's ops and fields are unchanged and that the email can register again through an invitation.
- [x] 2.6 Add `IssuePasswordReset`, which revokes earlier links, and `ResetPassword`, which uses a conditional update, sets the new hash and deletes sessions in one transaction, and keeps tokens. Verify with `TestResetLinkSingleUseUnderConcurrency`, `TestNewResetRevokesOld`, `TestResetKeepsTokensDropsSessions` and `TestResetExpired` under `go test ./...`.
- [x] 2.7 Add `ChangePassword`, which keeps the current session, drops the others and keeps tokens. Verify with `TestChangePasswordKeepsCurrentSession` and `TestChangePasswordWrongCurrent`.
- [x] 2.8 Add `TransferOwnership` per D7. Verify with `TestTransferOwnership`, which checks there is exactly one owner and the previous owner is now admin, `TestTransferToDeactivatedRefused`, and `TestConcurrentTransfersOneWins` under `go test ./...`.

## 3. Server: HTTP API

- [x] 3.1 Register the D8 routes behind `requireAuth`, before the `{collection}` patterns, and map errors to codes. Verify with the httptest suite `TestUserAdminRoutes`, which runs each route as anonymous (401), member (403), admin on an admin (403), owner on self (409 `self_action`), unknown id (404) and the success case.
- [x] 3.2 Register the public `GET`/`POST /api/v1/password-resets/{token}` routes under the per-IP limiter, with the origin check on POST. Verify with `TestResetRoutesPublicAndUniform404` and `TestResetRoutesRateLimited`.
- [x] 3.3 Add `POST /api/v1/me/password`. Verify with `TestMePasswordRoute`, covering anonymous 401, wrong current password 403, weak password 400 and success 204, using a second cookie that then gets 401.
- [x] 3.4 Add `adminLimiter` (60/hour per actor) and `passwordLimiter` (10/hour per account). Verify with `TestAdminRateLimit`, where the 61st request gives 429, and `TestPasswordChangeRateLimit`, where the 11th gives 429.
- [x] 3.5 Make the login handler map `ErrAccountDeactivated` to 403 `account_deactivated` with no cookie. Verify with the httptest case `TestLoginDeactivatedRoute`.
- [x] 3.6 Update `docs/api.md` with every route, its payload and the new error codes. Verify that the documented examples match the handler test fixtures.

## 4. Server: owner recovery CLI

- [x] 4.1 Add a subcommand `opentodo reset-owner-password` that prints a single-use reset link for the owner, using the same service code, and needs only the data directory. Verify with `TestResetOwnerPasswordCommand`, which checks the link works once, and with a manual run in the container under `make dev`.

## 5. Web app

- [ ] 5.1 In `web/src/lib/api.ts`, add typed client functions for every route. In `web/src/lib/roles.ts`, mirror the D1 matrix. Verify with `api.users.test.ts` (mocked fetch) and `roles.test.ts` (same cases as `TestAuthorizeMatrix`) under `npm test`.
- [ ] 5.2 Add `UsersPanel` in Settings for the owner and admins: the list with status and last sign-in, actions per row from `roles.ts`, a delete dialog that requires the email, a reset link shown once with copy, a transfer dialog with a password prompt, a role toggle for the owner, and an offline disabled state with nothing stored in Dexie. Verify with the component test `UsersPanel.test.ts` (fake-indexeddb shows no user data in the database) under `npm test`, and check that `npm run build` passes.
- [ ] 5.3 Extend `MembersPanel` so it is visible to admins. Verify with a component test in which an admin sees the panel and a member does not, under `npm test`.
- [ ] 5.4 Add a `PasswordSection` in Settings for every user, and the `/reset/:token` route with preview, form, invalid-link state, sign-out-first prompt for a signed-in visitor, and offline retry. Verify with `ResetScreen.test.ts` under `npm test`, and check that `npm run build` passes.
- [ ] 5.5 Add keyboard access: focusable rows, `d`, `r` and `Delete` with confirmation, documented in `?` help. Verify by doing deactivate → reactivate → reset → delete in the browser without a mouse.
- [ ] 5.6 Browser flow against `./bin/opentodo`. Verify that it completes without console errors:
  1. The owner invites B and C, and both accept.
  2. The owner promotes B to admin.
  3. B deactivates C. C's open tab drops to sign-in, and C's sign-in shows the deactivated message.
  4. B cannot act on the owner.
  5. The owner reactivates C and issues C a reset link. C sets a new password through the link.
  6. C changes the password again in Settings.
  7. The owner transfers ownership to B. The list shows B as owner and the previous owner as admin.
  8. B deletes C after typing C's email.

## 6. Audit integration

- [ ] 6.1 If `audit-log` is merged, add the D10 constructors to `internal/audit` and call `RecordTx` in every transaction from section 2, and `Record` for `login.failed` with reason `deactivated`. Otherwise leave a no-op `recorder` interface at each emission point and wire it when `audit-log` lands. Verify with `TestAdminActionsAudited`, where each action yields exactly one event, a rolled-back action yields none, and no event contains a secret or password, under `go test ./...`.

## 7. Docs and release

- [ ] 7.1 Update `docs/self-hosting/*.md` (managing users, recovering owner access with the CLI), `SECURITY.md` (deactivation semantics, reset links, the admin role) and `README.md`, and add a CHANGELOG entry under Unreleased. Verify that the links resolve and `make check` passes.

## 8. Two-factor integration (carried over from `mfa-totp`)

- [ ] 8.1 Wrap the self-service password-change route as `s.requireAuth(s.requireFresh(h))`, and add an owner action in the Users panel that calls `POST /api/v1/members/{id}/mfa/reset`; verify with `TestPasswordChangeRequiresFreshSession` and the browser flow step "owner resets a member's two-factor"
