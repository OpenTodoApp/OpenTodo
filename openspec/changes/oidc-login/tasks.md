# Tasks

## 1. Server: OpenID Connect core

- [ ] 1.1 `internal/oidc`: discovery with issuer check, PKCE, code exchange, JWKS cache with refresh on unknown key id, identity-token verification (RS256, PS256, ES256, EdDSA; `none` rejected; iss/aud/exp/iat/nonce), 10-second client timeouts; verify `TestVerifyIDTokenVectors` (positive and negative vectors), `TestDiscoveryRejectsIssuerMismatch` with `go test ./...`
- [ ] 1.2 Signed flow-state cookie (state, nonce, verifier, mode, 10-minute expiry); verify `TestFlowStateRoundTripAndExpiry`

## 2. Server: settings, identities and routes

- [ ] 2.1 Migrations for `settings`, `identities` and `sessions.id_token`; `internal/store` settings helpers with env override and `managedBy`; verify `TestSettingsEnvOverride` and the migration test reaching the new `user_version`
- [ ] 2.2 `internal/auth`: `MatchOrProvision` implementing subject-first matching, verified-email linking, provisioning under policy, `identity_taken`, `LocalLoginAllowed`; verify `TestOIDCSubjectFirstMatching`, `TestOIDCUnverifiedEmailNeverLinks`, `TestOIDCProvisionRespectsPolicy`, `TestSSOOnlyExemptsOwnerAndTokens`
- [ ] 2.3 Routes: `GET /api/v1/auth/oidc/start`, `GET /api/v1/auth/oidc/callback` (per-IP limiter, `oidc_disabled`), owner-only `GET/PUT /api/v1/settings/oidc` and `POST /api/v1/settings/oidc/test`, `GET/DELETE /api/v1/me/identities`, `redirect` in logout response, `oidc` in `auth/status`; verify `TestOIDCEndToEndWithFakeProvider` (an in-test provider serving discovery, JWKS, token endpoint), `TestOIDCSettingsRequireOwner`, `TestOIDCCallbackStateInvalid`, `TestUnlinkLastCredentialRefused`
- [ ] 2.4 `sso_required` enforcement in password and passkey sign-in handlers; verify `TestMemberPasswordRefusedInSSOOnly`
- [ ] 2.5 `docs/api.md` routes and error codes, `.env.example` with the optional `OPENTODO_OIDC_*` variables; verify the documented payloads match handler tests

## 3. Web app

- [ ] 3.1 `web/src/lib/api.ts` functions for settings, test, identities and the extended status; verify `npm run build`
- [ ] 3.2 Sign-in screen: provider button, SSO-only hiding with `?owner=1` break-glass, callback error display; verify component tests in `npm test` for each status combination and a browser run against the fake provider
- [ ] 3.3 Settings `SsoPanel` (owner) with redirect URI display, env-managed locks, test button, and `LinkedAccountsPanel` (all users) with link/unlink; offline read-only; keyboard reachable; verify component tests and a browser run; `npm run build` passes
- [ ] 3.4 Sign-out follows `redirect` when present; verify a browser run with the fake provider's end-session endpoint

## 4. Docs and release

- [ ] 4.1 New `docs/self-hosting/sso.md` with setup steps, redirect URI, SSO-only break-glass and emergency env override; `SECURITY.md` note on outbound requests to the configured issuer; `README.md`; CHANGELOG entry; verify links resolve and `make check` passes
- [ ] 4.2 End-to-end run with a real self-hosted provider: configure → test → member signs in and is provisioned → email-matched owner account links → SSO-only on → member password refused, owner still works → unlink refused for last credential; verify the run completes without console errors
