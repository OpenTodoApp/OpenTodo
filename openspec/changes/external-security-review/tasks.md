# Tasks

## 1. Preparation

- [x] 1.1 `docs/security/threat-model.md` with assets, entry points, attacker profiles, controls with their tests, accepted risks, one section per scope item; verify `make docs-check`
- [ ] 1.1b Review of the threat model by a second maintainer, recorded in its PR (the project has one maintainer today; owner question in the roadmap notes)
- [x] 1.2 `docs/security/README.md` (index, scope list, how findings are recorded), `docs/security/review-scope.md` (the engagement brief: pinned commit, method, scope table, findings format) and `docs/security/how-we-verify.md` (the retrospective, known gaps and past issues, independent review); verify `make docs-check`
- [ ] 1.3 (Optional, owner decision) Apply for funding (OSTIF first; Sovereign Tech Fund or NLnet NGI Zero as fallback), agree the scope and the 12-month independence rule in the engagement letter; verify the letter lists every scope item of the spec (checked by hand, noted in the PR that adds the review file)

## 2. Checks

- [x] 2.1 `scripts/security-review.test.mjs`: parse review files (record table, findings table), check scope items against threat model sections, check regression test paths exist; add to `make repo-check`; verify `node --test scripts/security-review.test.mjs` with valid and broken fixtures
- [x] 2.2 Release gate in `scripts/release/prepare.mjs` for versions ≥ 1.0.0 (review age, Critical/High retested, Medium rule, Low/Info issue links), naming each blocking finding; verify `node --test scripts/release/prepare.test.mjs` cases: no review file passes, open High, accepted Medium in target, Medium past target, review older than 24 months, new major without a fresh review
- [x] 2.3 `SECURITY.md` sections (what to expect, fix targets, coordinated disclosure, safe harbour, supported versions table, security reviews) and a repo check for their headings and numbers; verify `make repo-check`

- [x] 2.4 `/.well-known/security.txt` (D8): the public route, `docs/api.md`, `SECURITY.md`, the policy pin in `TestSecurityRoutePolicies`; verify `go test ./internal/httpapi -run 'TestSecurityTxt|TestSecurityRoutePolicies|TestEveryRouteIsInTheAPIDoc'`

## 3. Review and fixes (optional: only when a review takes place)

- [ ] 3.1 Pin the commit, build the two instances (demo mode, host mode) for the reviewer, give access; verify the commit hash is in the review file's `## Record` table
- [ ] 3.2 Record every finding in `docs/security/reviews/<yyyy-mm>-<reviewer>.md`; open private advisories for Critical, High and Medium; verify the repo check passes
- [ ] 3.3 Fix each finding in its own PR with a regression test (an OpenSpec change when behaviour changes), and get the reviewer's retest for Critical and High; verify `go test ./...`, `npm test` and the gate in 2.2 passing for `VERSION=1.0.0`
- [ ] 3.4 Publish advisories and CVEs for fixed findings that affected released versions; verify each row's `Advisory` column

## 4. Publication

- [ ] 4.1 (Optional: only after a review) Publish the report and summary in `docs/security/`, link them from `SECURITY.md` and the 1.0 release notes; verify `make docs-check`
- [x] 4.2 CHANGELOG entry under Unreleased; verify `make check`

## 5. Follow-ups from the threat model (gaps found while writing it)

- [ ] 5.1 Fuzz targets for the untrusted-input parsers without one: `oidc.VerifyIDToken`, the outbound address checks, `themes.Validate`, the `ruleval` parsers, `origin.Decode` and `location.Decode`; verify `scripts/fuzz.sh 10s` on each package
- [ ] 5.2 A test pinning the page security headers (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` and `script-src 'self'`, `nosniff`); verify `go test ./internal/httpapi`
- [ ] 5.3 A host-mode test that one tenant's API token is refused on another tenant's host name; verify `go test ./internal/host`
- [ ] 5.4 Extend `TestEveryRouteDeclaresAPolicy`'s source scan to the route packages under `internal/httpapi/` (`davroutes`, `maproutes`, `speech`); verify `go test ./internal/httpapi`
- [ ] 5.5 Align the client's accepted PBKDF2 iteration range (100,000 minimum) with the server's (600,000); verify `npm test` (an OpenSpec change if a device could be locked out by it)
- [ ] 5.6 A static check that REST handlers write through `ApplyStrict` and that no package outside `internal/sync` writes synced tables; verify `go test ./...`
- [ ] 5.7 An automated origin test of the iOS bridge, like the Android `BridgeFixtureTest`
- [ ] 5.8 A randomized convergence test on the TypeScript client, or a shared trace that pins the Go property test's model of `hlc.ts`; verify `npm test`
