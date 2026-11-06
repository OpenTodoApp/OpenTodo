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

- [x] 5.1 Fuzz targets for the untrusted-input parsers without one: `oidc.VerifyIDToken`, the outbound address checks, `themes.Validate`, the `ruleval` parsers, `origin.Decode` and `location.Decode`; verify `scripts/fuzz.sh 10s` on each package
- [x] 5.2 A test pinning the page security headers (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` and `script-src 'self'`, `nosniff`); verify `go test ./internal/httpapi`
- [x] 5.3 A host-mode test that one tenant's API token is refused on another tenant's host name; verify `go test ./internal/host`
- [x] 5.4 Extend `TestEveryRouteDeclaresAPolicy`'s source scan to the route packages under `internal/httpapi/` (`davroutes`, `maproutes`, `speech`); verify `go test ./internal/httpapi`
- [x] 5.5 Align the client's accepted PBKDF2 iteration range (100,000 minimum) with the server's (600,000); verify `npm test` (an OpenSpec change if a device could be locked out by it)
- [x] 5.6 A static check that REST handlers write through `ApplyStrict` and that no package outside `internal/sync` writes synced tables; verify `go test ./...`
- [ ] 5.7 An automated origin test of the iOS bridge, like the Android `BridgeFixtureTest`
- [ ] 5.8 A randomized convergence test on the TypeScript client, or a shared trace that pins the Go property test's model of `hlc.ts`; verify `npm test`
- [x] 5.9 A test that session and API token secrets are stored only as hashes (`TestSecretsStoredOnlyAsHashes`); verify `go test ./internal/auth`

## 6. Hardening the threat model calls for (ranked by risk)

Behaviour changes get their own small OpenSpec change (suggested name in brackets); the others are tests or checks under this change. Section 5's open items (5.5 to 5.8) stay where they are.

- [ ] 6.1 Device relay: show decryption requests as well as encryption requests, offer **Confirm before decrypting**, and name in each request the agent call it serves, so an opted-in device can tell an assistant's request from one the server made up [`relay-request-transparency`]; verify `npm test` (relay.test.ts) and `go test ./internal/relay`
- [x] 6.2 MCP OAuth: rotate refresh tokens on use and revoke the family on reuse (OAuth 2.1 for public clients); shorten the 180-day lifetime or make it the owner's choice [`mcp-oauth-refresh-rotation`]; verify `go test ./internal/mcpoauth ./internal/httpapi -run MCPOAuth`. Done: rotation and family revocation for every client except Google's connector, whose guide requires the same refresh token back; the lifetime stays 180 days from the last refresh (see the archived change's design)
- [x] 6.3 DNS rebinding without `OPENTODO_BASE_URL`: until the owner exists, refuse first-run registration from a `Host` that is neither an IP literal, `localhost`, nor the name the setup code was printed for; warn in Settings while no base URL is set [`host-check-without-base-url`]; verify `go test ./internal/httpapi -run 'Origin|Setup'`. Done as: a domain-name host asks for the setup code from the log (IP addresses, dotless and local-only names need none); the Settings warning was left out (that change's design D4)
- [x] 6.4 Cookie-authenticated writes with neither `Origin` nor `Sec-Fetch-Site`: refuse them (today they rely on `SameSite=Lax`) [`cookie-writes-need-origin`]; verify `TestCrossSiteCookieWritesAreRejected` extended and the route matrix. Done as: refused unless they declare a JSON body, which keeps `ot login` working (that change's design D2)
- [x] 6.5 AI agent limits per account as well as per token, so several agent tokens or OAuth clients do not multiply the daily budget [`agent-limits-per-account`]; verify `go test ./internal/agenttools`
- [x] 6.6 Backup destinations and the OIDC client: no proxy from the environment, and redirects only to the same host, like `internal/outbound`'s clients [`operator-clients-no-env-proxy`]; verify `go test ./internal/backup ./internal/oidc`
- [ ] 6.7 Host mode: one assistant concurrency limit for the whole host (today 8 per tenant) [`host-assistant-concurrency`]; verify `go test ./internal/host ./internal/assistant`
- [x] 6.8 Share target: refuse a POST without `Sec-Fetch-Site` unless it comes from the installed app's own navigation [`share-target-fetch-metadata`]; verify `npm test` (shareInbox.test.ts)
- [x] 6.9 Importers: a per-field and per-row byte limit for CSV and a nesting depth limit for JSON, so a valid but hostile file stays bounded in memory [`importer-field-limits`]; verify `go test ./internal/importer` and `FuzzParse`
- [ ] 6.10 Route matrix over public routes: anonymous, each token scope and cross-site, each compared with what the route's reason promises; verify `go test ./internal/httpapi -run TestRouteMatrix`
- [ ] 6.11 Demo deny list probed with every HTTP method for rules without one; verify `go test ./internal/httpapi -run TestDemoDenyListMatchesPolicy`
- [ ] 6.12 Fuzz targets for the Microsoft Graph event parser and the import planner; verify `scripts/fuzz.sh 30s ./internal/calsync ./internal/importer`
- [ ] 6.13 (Long term, design doc first) Accepted risks that would need new design: a tamper-evident audit log (hash chain), CPU and memory isolation between hosted tenants, a version or time in the encryption's authenticated data against rollback, and release-signature checks of the web app in the service worker
- [x] 6.14 Agent paths refuse routines that send content off the server: creating, changing, turning on and running a routine with a Send a webhook, Email me or Email project members step answer `forbidden_for_agents`; reading, testing, turning off and trashing stay open [`agent-routine-sends`, #930]; verify `go test ./internal/agenttools -run TestSendsOut` and `go test ./internal/httpapi -run TestRoutineSendingStepsRefusedForAgents`
- [x] 6.15 `run_routine` runs only within what is left of the agent's daily items (token and account), holding them before the run and settling after [`agent-run-routine-limits`, #934]; verify `go test ./internal/agenttools -run 'TestRunRoutineWithinDailyItems|TestLimiterHold'` and `go test ./internal/rules -run TestRoutineRunMaxWrites`
