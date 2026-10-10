# Tasks

## 1. Server: OpenID Connect core

- [x] 1.1 `internal/oidc`: discovery with issuer check, PKCE, code exchange, JWKS cache with refresh on unknown key id, identity-token verification (RS256, PS256, ES256, EdDSA; `none` rejected; iss/aud/exp/iat/nonce), 10-second client timeouts; verify `TestVerifyIDTokenVectors` (positive and negative vectors), `TestDiscoveryRejectsIssuerMismatch` with `go test ./...`
  - Also `TestRFC8037Ed25519Vector`, `TestJWKSRefreshOnUnknownKid`, `TestExchangeChecksPKCEAndClientAuth`. Vectors are signed in-process rather than taken from two public providers (live tokens expire and need network); see design.md, Implementation notes.
- [x] 1.2 Signed flow-state cookie (state, nonce, verifier, mode, 10-minute expiry); verify `TestFlowStateRoundTripAndExpiry`

## 2. Server: settings, identities and routes

- [x] 2.1 Migrations for `settings`, `identities` and `sessions.id_token`; `internal/store` settings helpers with env override and `managedBy`; verify `TestSettingsEnvOverride` and the migration test reaching the new `user_version`
  - `0014_oidc.sql` (idempotent): `settings` already existed (kept as `CREATE TABLE IF NOT EXISTS`), `identities`, and `session_oidc` as an idempotent side table instead of `ALTER TABLE sessions ADD COLUMN id_token`. Env override and `managedBy` live in `internal/oidc` (`TestSettingsEnvOverride`) on top of the existing `internal/settings` helpers; the client secret goes to `<data>/secrets/oidc.json`. Migration test: `TestMigrationOIDC`.
- [x] 2.2 `internal/auth`: `MatchOrProvision` implementing subject-first matching, verified-email linking, provisioning under policy, `identity_taken`, `LocalLoginAllowed`; verify `TestOIDCSubjectFirstMatching`, `TestOIDCUnverifiedEmailNeverLinks`, `TestOIDCProvisionRespectsPolicy`, `TestSSOOnlyExemptsOwnerAndTokens`
- [x] 2.3 Routes: `GET /api/v1/auth/oidc/start`, `GET /api/v1/auth/oidc/callback` (per-IP limiter, `oidc_disabled`), owner-only `GET/PUT /api/v1/settings/oidc` and `POST /api/v1/settings/oidc/test`, `GET/DELETE /api/v1/me/identities`, `redirect` in logout response, `oidc` in `auth/status`; verify `TestOIDCEndToEndWithFakeProvider` (an in-test provider serving discovery, JWKS, token endpoint), `TestOIDCSettingsRequireOwner`, `TestOIDCCallbackStateInvalid`, `TestUnlinkLastCredentialRefused`
  - The in-test provider is `internal/oidc/oidctest` (TLS, discovery, authorize, token with PKCE and client-auth checks, JWKS, end-session).
- [x] 2.4 `sso_required` enforcement in password and passkey sign-in handlers; verify `TestMemberPasswordRefusedInSSOOnly`
  - Also enforced on password registration (open sign-up and invitations) so the mode cannot be bypassed by creating a password account.
- [x] 2.5 `docs/api.md` routes and error codes, `.env.example` with the optional `OPENTODO_OIDC_*` variables; verify the documented payloads match handler tests

## 3. Web app

- [x] 3.1 `web/src/lib/api.ts` functions for settings, test, identities and the extended status; verify `npm run build`
- [x] 3.2 Sign-in screen: provider button, SSO-only hiding with `?owner=1` break-glass, callback error display; verify component tests in `npm test` for each status combination and a browser run against the fake provider
  - `AuthScreen.oidc.test.ts`. Browser run (Chromium, fake provider): provider button, keyboard sign-in, SSO-only screen without password fields, `?owner=1` form shown. The run's final click on the owner's "Sign in" button hit a selector ambiguity in the smoke script (two buttons start with "Sign in"); owner break-glass sign-in was then confirmed against the same server with the API, and is covered by `TestMemberPasswordRefusedInSSOOnly`. The callback error display is covered by component tests only.
- [x] 3.3 Settings `SsoPanel` (owner) with redirect URI display, env-managed locks, test button, and `LinkedAccountsPanel` (all users) with link/unlink; offline read-only; keyboard reachable; verify component tests and a browser run; `npm run build` passes
  - `SsoPanel.test.ts`. Browser run: configured the provider through the panel, test connection, linked accounts listed, unlink of the last credential refused with the explanation.
- [x] 3.4 Sign-out follows `redirect` when present; verify a browser run with the fake provider's end-session endpoint
  - Browser run: the member's sign-out landed on the fake provider's `/logout` with `id_token_hint` and `post_logout_redirect_uri`.

## 4. Docs and release

- [x] 4.1 New `docs/self-hosting/sso.md` with setup steps, redirect URI, SSO-only break-glass and emergency env override; `SECURITY.md` note on outbound requests to the configured issuer; `README.md`; CHANGELOG entry; verify links resolve and `make check` passes
- [ ] 4.2 End-to-end run with a real self-hosted provider: configure → test → member signs in and is provisioned → email-matched owner account links → SSO-only on → member password refused, owner still works → unlink refused for last credential; verify the run completes without console errors
  - Not done: no real provider (Authentik, Keycloak, …) can be run or reached in this environment. The same sequence ran in Chromium against the in-process fake provider (`oidctest`) and in `TestOIDCEndToEndWithFakeProvider`; the only console errors were the expected `409` of the refused unlink and `404`s from `/api/v1/push/vapid-key` because the run used `OPENTODO_PUSH=off`. Run this once against a real provider before release.

## 5. Two-factor integration (carried over from `mfa-totp`)

- [x] 5.1 Provider sign-in starts the session with `startSession(w, r, u, status, true)` so it satisfies two-factor, and `PUT /api/v1/settings/oidc` is wrapped as `s.requireAuth(s.requireFresh(h))`; verify with a test that an enrolled account signing in through the provider is not asked for a code and that changing SSO settings on a stale session returns `403 reauth_required`
  - The callback redirects, so it uses `issueSession(w, r, u, true)`, the cookie half that `startSession` now delegates to. Verified by `TestOIDCSignInSatisfiesMFA`, which also checks that re-running the provider flow from the signed-in browser re-authenticates the session.
