# Tasks

Backend tasks are verified with `go test ./...`; frontend tasks with `npm test` and `npm run build` in `web/`, plus `make i18n-check`.

## 1. Server

- [x] 1.1 Passkey registration and authenticator-app enrolment routes are `sensitive()`; verify with `credential_freshness_test.go` "TestAddingCredentialsNeedsRecentSignIn" and the `TestSecurityRoutePolicies` table.
- [x] 1.2 Confirming an authenticator app sets only `mfa_at`; verify with "TestConfirmingTOTPDoesNotGrantFreshness".
- [x] 1.3 Provider links from an older session only re-confirm an identity the account already has; a new link grants no freshness; verify with "TestOIDCLinkNeedsRecentSignIn" and the existing `TestOIDCSignInSatisfiesMFA`.

## 2. Web

- [x] 2.1 Enrolment and passkey registration ask for the password and repeat the step; a cancelled prompt changes nothing; verify with `credentialReauth.test.tsx` "asks for the password, then shows the authenticator setup", "says what to do when the prompt is cancelled" and "adds a passkey after the password is confirmed".
- [x] 2.2 A refused provider link opens the prompt and starts the link again; the dialog offers the provider when single sign-on is on; verify with `credentialReauth.test.tsx` "asks for the password and starts the link again" and "offers the single sign-on provider when the server has one".

## 3. Documentation

- [x] 3.1 docs/api.md, the two-factor and passkey guide text and CHANGELOG `### Security`; verify with `make docs-check`.
