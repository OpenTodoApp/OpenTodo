# Tasks

## 1. Server: storage and service

- [x] 1.1 Add migration `internal/store/migrations/0002_invitations.sql` with the `invitations` table and indexes on `created_by` and `expires_at`; verify `go test ./internal/store/...` opens an empty data dir and reaches `user_version` 2
- [x] 1.2 `internal/auth`: `CreateInvitation`, `ListInvitations`, `RevokeInvitation`, `PreviewInvitation`, derived status helper and `CanInvite`; verify `TestInvitationLifecycle` (create → list pending → revoke → preview refused) with `go test ./...`
- [x] 1.3 `internal/auth.Register` accepts an invitation secret, consumes it in the same transaction and enforces the email binding; verify `TestRegisterWithInvitationWhileSignupClosed`, `TestInvitationSingleUseUnderConcurrency`, `TestInvitationEmailMismatch` with `go test ./...`

## 2. Server: HTTP API

- [x] 2.1 Register `GET/POST /api/v1/invitations` and `DELETE /api/v1/invitations/{id}` behind `requireAuth` plus the owner check (403 `forbidden`); verify `TestInvitationRoutesRequireOwner` covering anonymous 401, member 403 and owner 201/200/204
- [x] 2.2 Register unauthenticated `GET /api/v1/invitations/{token}` preview under the per-IP limiter and extend `handleRegister` to read `invitation`; verify `TestInvitationPreviewAndAccept` and `TestInvitationPreviewRateLimited`
- [x] 2.3 Per-user creation limiter (20/hour) and `invalid_input` on bad `expiresInHours`/`email`; verify `TestInvitationCreationRateLimit` and `TestInvitationInvalidInput`
- [x] 2.4 Update `docs/api.md` with the four routes, the `invitation` field on register and the new error codes; verify the documented payloads match the handler tests

## 3. Web app: owner settings

- [x] 3.1 `web/src/lib/api.ts`: client functions for list, create, revoke and preview with typed responses; verify `npm test` passes new `api.invitations.test.ts` using a mocked fetch
- [x] 3.2 `MembersPanel` in Settings, rendered for `role === "owner"` only: list with status badges, create form (email, expiry), one-time link display with copy, revoke with confirm, offline read-only state; verify in the browser that a member sees no panel, the link appears once, and disabling the network greys out the actions; `npm run build` passes
- [x] 3.3 Keyboard reachability of the panel (focusable rows, Enter copies, Delete revokes, documented in the `?` help); verify by completing create → copy → revoke without a mouse

## 4. Web app: acceptance flow

- [x] 4.1 Route `/invite/:token` with preview fetch, locked email when bound, registration form posting `invitation`, and handling of `invitation_invalid`, `invitation_email_mismatch`, `email_taken`, `rate_limited`; verify in the browser against a running server that a bound link pre-fills and locks the email and a revoked link shows the invalid screen; `npm run build` passes
- [x] 4.2 Signed-in visitor sees a sign-out-first prompt; offline visitor sees a retry message; verify both states manually and with a component test in `npm test`

## 5. Docs and release

- [x] 5.1 Update `README.md`, `docs/self-hosting/docker.md` and `docs/self-hosting/coolify.md` to recommend invitations over `OPENTODO_ALLOW_SIGNUP`, and add a CHANGELOG entry under Unreleased; verify links resolve and `make check` passes
- [x] 5.2 End-to-end run: owner creates a bound invitation → second browser profile accepts while sign-up is closed → second use is refused → owner sees `accepted` with the account; verify the run completes without console errors
