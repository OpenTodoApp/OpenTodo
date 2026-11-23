## 1. Server

- [x] 1.1 `oidc.Claims` tells a missing `email_verified` claim from `false`; verified by a `jwt` test
- [x] 1.2 The stored setting `oidc.trust_missing_email_verified` in `oidc.Config`, `oidc.Update`, the settings JSON and the audit; verified by a settings test
- [x] 1.3 `MatchOrProvision`: a trusted missing claim creates only, never links, never confirms the address; verified by `internal/auth` tests for each scenario
- [x] 1.4 The callback passes the setting through and the server logs a warning at start while it is on; verified by `internal/httpapi` tests

## 2. Web

- [x] 2.1 The switch in Settings → Single sign-on, with a warning while it is on; strings in every catalog; verified by `SsoPanel.test.ts`

## 3. Docs

- [x] 3.1 `docs/self-hosting/sso.md`: Synology SSO Server, the switch and its warning, and the manual linking path; changelog fragment

## 4. Check

- [ ] 4.1 `make check`
