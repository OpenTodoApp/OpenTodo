# Tasks

## 1. Policy wrapper (SEC-8, SEC-12)

- [x] 1.1 `internal/httpapi/policy.go`: `routePolicy`, `routes.handle`, `admits`; every registration converted, handler owner/session checks removed (`go test ./internal/httpapi`)
- [x] 1.2 `policy_test.go`: `TestEveryRouteDeclaresAPolicy`, `TestSecurityRoutePolicies`, `TestDemoDenyListMatchesPolicy`, `TestRolePolicyBeforeCredentials`

## 2. Admin scope (SEC-3)

- [x] 2.1 `auth.ScopeAdmin`, `FullAccess`, migration `0036_api_token_admin`, stored as read + marker (`TestAdminTokenOnlyFromFreshSession`)
- [x] 2.2 Credential routes refuse full tokens and accept admin tokens (`TestCredentialRoutesNeedAdminToken`, `TestPreScopeTokensAreFull`, updated `TestPasswordChangeRequiresFreshSession`, `TestBearerTokenNeverChallenged`)
- [x] 2.3 Web token dialog: Admin option and warning (`web/src/app/tokens.test.tsx`)

## 3. Single sign-on linking (SEC-4)

- [x] 3.1 `MatchOrProvision` refuses guarded accounts (`TestOIDCEmailNeverLinksGuardedAccounts`, updated `TestOIDCSubjectFirstMatching`)
- [x] 3.2 Callback answers `oidc_link_required`; just-linked identity never stands in for a local factor (updated `TestOIDCEndToEndWithFakeProvider`, `TestOIDCSignInSatisfiesMFA`)
- [x] 3.3 Sign-in screen message and error table entry (`npx vitest run src/lib/i18n/i18n.test.ts`)

## 4. Reset and sign out everywhere (SEC-16)

- [x] 4.1 Reset forgets trusted devices (`TestResetKeepsTokensDropsSessions`, `TestSelfServiceResetForgetsTrustedDevices`)
- [x] 4.2 `SignOutEverywhere` + `POST /api/v1/me/sign-out-everywhere` + `sessions.revoked` (`auth.TestSignOutEverywhere`, `httpapi.TestSignOutEverywhere`)
- [x] 4.3 Settings → Account → Session → Sign out everywhere (`web/src/app/accountSettings.test.tsx`)

## 5. Docs and checks

- [x] 5.1 docs/api.md, docs/cli.md, docs/account-security.md, docs/settings-you.md, docs/self-hosting/sso.md, SECURITY.md, CHANGELOG (`make docs-check`)
- [x] 5.2 Translations in de, es, fr, it, pt (`node scripts/i18n-check.mjs`)
- [x] 5.3 `go vet ./...`, `go test ./...`, `cd web && npx tsc --noEmit`, OpenSpec validate
