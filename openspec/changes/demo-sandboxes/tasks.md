# Tasks

## 1. Data model and accounts

- [ ] 1.1 Migration `0025_demo_sandboxes.sql` (idempotent): `demo_sandboxes` (user id, collaborator id, created_at, last_active_at, address hash, op counters); verify `TestMigrationDemoSandboxes` (`go test ./...`)
- [ ] 1.2 `auth`: password-less, session-only provisioning for sandbox and collaborator accounts (password sign-in impossible); verify `TestSandboxAccountCannotSignInWithPassword`
- [ ] 1.3 Remove the shared demo account on first start of this version; verify `TestUpgradeDeletesSharedDemoAccount`

## 2. Sandbox lifecycle

- [ ] 2.1 `POST /api/v1/demo/sandbox`: creation token from `auth/status` (HMAC, 10 min, single use), same-origin, per-address limit, live cap with idle eviction, database size guard; seeds through the op log and returns a session; verify `TestSandboxCreation`, `TestSandboxTokenSingleUse`, `TestSandboxCreationLimits`, `TestSandboxCapEvictsIdle`
- [ ] 2.2 Isolation: two sandboxes never see each other's data, membership changes refused, assignment and mentions limited to the sandbox; verify `TestSandboxIsolation`
- [ ] 2.3 Expiry and cleanup job (jobs leader only, every 5 minutes): idle 2 h, max 24 h, delete accounts, sessions, ops, fields, notifications, activity, markers in one transaction per sandbox; 401 `demo_expired` for their sessions; verify `TestSandboxExpiry`, `TestExpiredSessionGetsDemoExpired`
- [ ] 2.4 Nightly reset deletes every sandbox and runs `VACUUM`; verify `TestNightlyResetDeletesAllSandboxes`

## 3. Limits and headers

- [ ] 3.1 Write budget (600 ops/hour, 5,000 total, counters in SQLite) on sync and REST writes with 429 `demo_limit`; field size caps (4 KB text, 32 KB notes); verify `TestSandboxWriteBudget`, `TestDemoFieldSizes`
- [ ] 3.2 `X-Robots-Tag: noindex, nofollow` on every demo response and `noindex` meta in the page; verify `TestDemoRobotsHeader`

## 4. Web app

- [ ] 4.1 Sign-in: "Try the demo" posts for a sandbox with the token, no credentials shown; banner text; `demo_busy`, `demo_limit` and rate-limit notices; verify `demo.test.tsx`
- [ ] 4.2 `demo_expired`: clear the local database and show the expiry screen with "Start a new sandbox"; verify a vitest case
- [ ] 4.3 Markdown links render with `rel="nofollow ugc noopener noreferrer"`; verify `markdown.test.ts`

## 5. Docs and verification

- [ ] 5.1 `docs/self-hosting/demo.md` (sandboxes, limits, optional tuning variables, data deletion), README config row, CHANGELOG; verify `make check`
- [ ] 5.2 One browser run with two contexts: two sandboxes see only their own data, an expired sandbox shows the expiry screen, a link renders nofollow; verify the run passes with no console errors
