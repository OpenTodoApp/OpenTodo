# Tasks

## 1. Server: one-time passwords and storage

- [x] 1.1 `internal/auth/totp.go`: secret generation, provisioning URI, code verification with one-step tolerance, constant-time compare, last-used-step replay guard; verify `TestTOTPVectors` (published test vectors) and `TestTOTPReplayRefused` with `go test ./...`
- [x] 1.2 Migrations for `mfa_totp`, `mfa_recovery_codes`, `trusted_devices`, `sessions.mfa_at`, `sessions.reauth_at`, and `settings` if absent; verify the store migration test reaches the new `user_version`
- [x] 1.3 Recovery codes: generate ten, hash, consume once, regenerate; verify `TestRecoveryCodesSingleUseAndRegenerate`

## 2. Server: sign-in, step-up, policy, routes

- [ ] 2.1 Login returns `mfaRequired` with a 5-minute, 5-attempt challenge for enrolled accounts; `POST /api/v1/auth/mfa` with code or recovery code; trusted-device cookie; passkey with user verification and provider sign-in set `mfa_at`; verify `TestTwoStepLogin`, `TestChallengeExhausted`, `TestTrustedDeviceSkipsSecondStep`, `TestPasskeyUVSatisfiesMFA`
- [ ] 2.2 `POST /api/v1/auth/reauth`, `requireFresh` middleware on token creation, password change, MFA disable, recovery regeneration, SSO/MFA/invitation settings; bearer tokens exempt; verify `TestReauthRequiredOnStaleSession`, `TestBearerTokenNeverChallenged`, `TestReauthRateLimited`
- [ ] 2.3 Policy `GET/PUT /api/v1/settings/mfa` (owner only) and the enrolment-restricted session check with its allowlist; verify `TestPolicyRestrictsUnenrolledSessions`, `TestPolicyRequiresOwner`
- [ ] 2.4 Enrolment routes (`enroll`, `confirm`, `DELETE totp`, `recovery-codes/regenerate`, trusted devices list/delete), owner `POST /api/v1/members/{id}/mfa/reset`, `opentodo mfa-reset <email>` subcommand; verify `TestEnrolConfirmDisable`, `TestDisableRefusedByPolicy`, `TestOwnerResetClearsEverything`, and the subcommand against a temp data dir
- [ ] 2.5 `docs/api.md` with every route, the two-step login shape and error codes; `SECURITY.md`; verify documented payloads match handler tests

## 3. Web app

- [ ] 3.1 Add the QR encoder dependency and record its gzipped size in `design.md`; `web/src/lib/api.ts` functions for all routes, global `reauth_required` and `mfa_enrolment_required` handling with one retry; verify `npm test` passes `api.reauth.test.ts` (mocked fetch sequence) and `npm run build`
- [ ] 3.2 Sign-in screen: code step with recovery toggle and remember-device checkbox; verify component tests for `mfaRequired`, wrong code, and exhausted challenge in `npm test`, plus a browser run
- [ ] 3.3 Security panel: enrolment wizard (QR, manual key, confirm), recovery codes once with copy/download, remaining count, trusted devices, owner policy select, `ReauthDialog`; offline read-only; keyboard reachable; verify component tests and a browser run; `npm run build` passes
- [ ] 3.4 Sync status maps `mfa_enrolment_required` to an actionable message linking to the wizard; verify by enabling the policy for a signed-in unenrolled member and observing the status and that queued edits upload after enrolment

## 4. Docs and release

- [ ] 4.1 `README.md` feature list, `docs/self-hosting/docker.md` note on NTP and the `mfa-reset` subcommand, CHANGELOG entry; verify links resolve and `make check` passes
- [ ] 4.2 End-to-end run: enrol → sign out → two-step sign-in with remember → sign-in skips step → forget devices → recovery code sign-in → stale session token creation triggers re-authentication → owner sets policy to everyone → unenrolled member restricted → owner resets member; verify the run completes without console errors
