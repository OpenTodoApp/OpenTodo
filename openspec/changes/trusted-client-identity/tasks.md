## 1. Client address

- [x] 1.1 Forwarded headers only from trusted peers; default loopback/private/link-local; `private` keyword; `cloudflare` keeps the default (`TestForwardedForOnlyFromTrustedPeers`, `TestClientAddressBehindTrustedProxies`, `TestInvalidTrustedProxyEntriesNeverWidenTrust`, `TestInvitationLinkUsesRequestOrigin`)
- [x] 1.2 Configuration warning for a list without a local proxy (`TestTrustedProxiesPrivateKeyword`, `TestTrustedProxiesLenient` in `go test ./internal/config`)
- [x] 1.3 IPv6 keyed by /64 in every limiter and the demo sandbox limit (`TestLimiterIPv6Per64`)

## 2. Limiters

- [x] 2.1 One limiter per purpose; sign-in counts failures only (`TestLimitersPerPurpose`, `TestLoginLimitCountsFailuresOnly`, `TestPasskeyLoginRateLimit`, `TestPublicListRead`, `TestInvitationPreviewRateLimited`)
- [x] 2.2 Per-account failure limit for password, second step and re-authentication; success clears it (`TestAccountLockout`, `TestAccountFailuresResetOnSuccess`, `TestReauthAccountLockout`, `TestReauthRateLimited`)
- [x] 2.3 Background sweep instead of sweeping under the hit lock; duplicate helper removed from `caldav.go` (`TestLimiterSweepsOutsideHit`, `go vet ./...`)

## 3. First run

- [x] 3.1 Setup code generated, logged once, required from public addresses, discarded after setup (`TestSetupCode` in `internal/auth`, `TestSetupCodeFromLog`, `TestSetupFromPublicAddressNeedsCode`, `TestNoSetupCodeWithToken`)
- [x] 3.2 Origin must be addressed to the base URL's host (`TestOriginMustMatchBaseURL`, mail tests send the base origin)
- [x] 3.3 Web app: setup code prompt, `setup_code_invalid` and `account_locked` messages in all shipped languages (`npx vitest run src/app/AuthScreen.setup.test.ts`, `npx tsc --noEmit`, `make i18n-check`, error-code fixture)

## 4. Transport

- [x] 4.1 Secure cookies over TLS or a trusted proxy's https (`TestSecureCookieOverTLS`)
- [x] 4.2 HSTS with an https base URL (`TestHSTSWithHTTPSBaseURL`)

## 5. Docs and release notes

- [x] 5.1 docker.md (setup code, proxies, limits), getting-started, README quick start and configuration table, SECURITY.md, platform notes (`make docs-check`)
- [x] 5.2 CHANGELOG under Security and Changed with operator notes
- [x] 5.3 `go test ./...`, `npx --yes @fission-ai/openspec validate --all --strict`
