# Tasks

The maintainer approved the design on #1025 (2026-11-08). The work lands in two phases (design D17): **phase 1, report-only**, where every check runs and is recorded but updates are still installed; and **phase 2, refusal**, switched on by a signed release after real setups pass. iOS is a separate, later change (answer 6). Backend tasks run `go test ./...`. Frontend tasks run `npm test` and `npm run build` in `web/`. `make check` runs before the last task of each phase.

## 0. Decisions

- [x] 0.1 The maintainer answers questions 1 to 6 in design.md, and the answers and his three additions (report-only first, hosting tests before refusal, an actionable message) are folded into design.md, the specs and these tasks. Verified by `make openspec-validate` and the maintainer's approval on the pull request.
- [ ] 0.2 The maintainer generates the release key and the recovery key offline with `websign keygen`, stores the release key as the secret `WEB_SIGNING_KEY` of the `web-signing` environment (deployment rule: `v*` tags only; required reviewer: the maintainer), keeps the recovery key offline with a second copy elsewhere, and commits both public keys to `internal/websign/release-keys.json`. Verified by `gh api repos/OpenTodoApp/OpenTodo/environments/web-signing` showing the tag rule and the reviewer, and by the two public keys in `internal/websign/release-keys.json`.

## Phase 1: report-only

### 1. Signing tool and shared vectors

- [x] 1.1 `internal/websign`: the manifest and envelope types, the domain string, ECDSA P-256 verify, raw r||s signatures, fingerprints (full and short), the `refuse` field and semver precedence; standard library only. `internal/websign/sign`: key generation and signing. Verified by `go test ./internal/websign/...`.
- [x] 1.2 `cmd/websign` with `keygen`, `sign <dist>` (refuses files that don't match the list, and a version that doesn't match `--version`) and `verify <dist|url>`. Verified by `go test ./cmd/websign` round trips and a tampered-file refusal.
- [x] 1.3 Shared vectors `internal/websign/testdata/manifest.vectors.json` (valid, bad signature, unknown key, wrong domain, mutated payload, two signatures, recovery key, version order) and the test key `internal/websign/testdata/test-key.pem`; listed in `docs/contracts.md`. Verified by `TestVectors` and `make docs-check`.
- [x] 1.4 A test that keeps `internal/websign/sign` out of the server binary, like `TestServerDoesNotLinkCrypt` in `internal/e2ee/crypt`. Verified by `go test ./internal/websign/...`.

### 2. Build and server

- [ ] 2.1 `scripts/app-manifest.mjs`, run by `npm run build` after `vite build`, writes the unsigned `app-manifest.json`: every file in `dist` as `install` or `lazy`, the worker's hash, the build's key set and `refuse` from `internal/websign/release-keys.json`, the version from `OPENTODO_VERSION` and the preview label from `OPENTODO_BUILD`. With `WEB_SIGNING_KEY` set, `make web` signs with it. Verified by a test of the script on a fixture `dist`, and by `make web` then `go run ./cmd/websign verify internal/web/dist`.
- [x] 2.2 `internal/web`: `/index.html` served unmodified, `app-manifest.json` with `no-store`, and `no-transform` on every app file. Branded and `noindex` navigations unchanged. Verified by `go test ./internal/web` and `TestSecurityHeaders`.
- [x] 2.3 The server logs the build's signature state and short fingerprint at startup, and warns when the embedded files don't match their list. Verified by `TestLogSignature` (`go test ./internal/web`).
- [ ] 2.4 The Dockerfile accepts the BuildKit secret `web_signing_key`, and the build args `VERSION` and `OPENTODO_BUILD` reach the web stage. Verified by `docker build --secret id=web_signing_key,src=internal/websign/testdata/test-key.pem .` followed by `websign verify` against the running container.
- [x] 2.5 The page applies the branded title and icons from `branding.ts` on start, so the worker can serve the signed `index.html` byte for byte. Verified by `web/src/lib/branding.test.ts`.

### 3. The verifier worker, report-only

- [ ] 3.1 Replace Workbox in `web/src/sw.ts` with the verifier: the trust record in its own IndexedDB database, first-use modes and the ratchet (D5), the update check, staging and the atomic switch (D6), the previous set kept for open tabs, report-only and the `refuse` ratchet (D17). `sw.js` keeps the inlined Workbox-format list as data for installed Android apps (D6). Remove `workbox-core`, `workbox-precaching` and `workbox-routing`. Verified by `web/src/sw.test.ts`: valid update installed; tampered chunk installed and recorded (report-only) or refused (refusal on); interrupted download leaves `current`; older and equal-but-different versions recorded or refused; unsigned recorded in signed mode without leaving signed mode; self-built moves to signed; `refuse: true` cannot be turned off; offline makes no check.
- [ ] 3.2 Phase 1 serving rules (D7): listed files from the verified set, lazy files checked on first load (recorded while reporting), no scripts, workers or styles from data paths, today's navigation deny list, and the page CSP from the build with only the server's `connect-src` origins. A shared fixture keeps the policy equal to Go's `cspBase`. Verified by `web/src/sw.test.ts` and `go test ./internal/httpapi -run TestCSP`.
- [ ] 3.3 Signing out and the revoked-device wipe keep the trust record. Verified by `web/src/lib/revocation.test.ts` and a `sw.test.ts` case.
- [ ] 3.4 The worker's tests read the shared vectors. Verified by `web/src/lib/appCode.test.ts`.
- [ ] 3.5 The reminder push tests still pass. Verified by `web/src/lib/pushWorker.test.ts` and `push.test.ts`.

### 4. Page, Settings and help

- [ ] 4.1 `appUpdate.ts` and `UpdateBanner`: the worker's `refused` message with its cause, the cause texts, **What to do** opening the help page, a close button for refusals, each list announced once. Verified by `web/src/lib/appUpdate.test.ts` and an `UpdateBanner` story in the refused states.
- [ ] 4.2 Settings → About: the "App code" row in its states (D10), the failed-check notice with its cause and **What to do**, **Copy diagnostics**, the version the device runs, the Security page link and Verify. The copy goes in every catalog. Verified by a component test, the About story and `make i18n-check`.
- [ ] 4.3 The help page `docs/signed-updates.md` (D18): Cloudflare and other proxies, rolled-back servers, self-built servers, getting unstuck. Verified by `make docs-check` and the help build.
- [ ] 4.4 Measure the first load. Raise `web/bundle-budget.json` only if it passes the budget, and name this change in the comment. Verified by `make bundle-budget`.

### 5. Release and documentation

- [ ] 5.1 The `web-sign` job in `.github/workflows/ci.yml`: tags only, the only job in the `web-signing` environment, a no-op that passes the unsigned build through when `WEB_SIGNING_KEY` is not set; its output feeds the image and the binaries; the release attaches `app-manifest.json`; `latest` builds carry the preview label. Verified by `scripts/repo-checks.test.mjs` (only `web-sign` uses the environment, official fingerprints match SECURITY.md and the docs, the test key is never official).
- [ ] 5.2 The image smoke test runs `websign verify` against the running container: unsigned is accepted until `internal/websign/release-keys.json` holds a key, then a tag build must verify. Verified by the image job.
- [ ] 5.3 Browser end to end, `scripts/e2e-signed.mjs`: v1 installed; v2 with one changed byte installed and recorded with its path (report-only); valid v2 accepted with the check passed; signed v0 recorded as older; offline reload from the verified set. Verified by `make e2e-signed`.
- [ ] 5.4 Threat model (saying plainly that report-only mode is on), limits, `docs/e2ee.md`, SECURITY.md and the new `docs/security/signed-app.md`, with the texts of design D14; `docs/security/how-we-verify.md` names the tests; the self-hosting docs (the own-key setting, proxies that rewrite files, `websign verify`, rolled-back servers). Verified by `make docs` and `make docs-check`.
- [ ] 5.5 Website (`OpenTodoWebsite`): the fingerprints on the Security page, anchored at `#app-signing`, and the static `/security/verify` page that compares the address fragment. Verified by that repository's build and a manual check with a known and an unknown fingerprint. Waits for 0.2.
- [ ] 5.6 Changelog fragments under `changelog.d/Security/` and `changelog.d/Added/`, and the `external-security-review` item 6.13d pointing to this change. Verified by `make repo-check`.
- [ ] 5.7 Rehearse the rotation once with throwaway keys (answer 3): a server signed with key A, a release signed with A and B listing B, then one signed with B only, and the lost-key path with a throwaway recovery key; record the run in `docs/security/signed-app.md`. Verified by `scripts/e2e-signed.mjs` rotation cases.

## Phase 2: refusal

### 6. Real hosting before refusal (the maintainer's second addition)

- [ ] 6.1 PikaPods: an official signed release installs with the check passed, and an update passes. Record the result in `docs/signed-updates.md`.
- [ ] 6.2 A server behind Cloudflare: with Auto Minify and Rocket Loader off the check passes; with each on, the check fails with the proxy cause and the help page's fix makes it pass again. Record the result.
- [ ] 6.3 The official image behind nginx and Caddy with their usual settings: the check passes.
- [ ] 6.4 At least one release's report-only results (issues, support chats with diagnostics lines) show no unexplained failure.

### 7. Turning refusal on

- [ ] 7.1 Set `"refuse": true` in `internal/websign/release-keys.json` in a release, and update the threat model and limits to say refusal is on. Verified by `scripts/repo-checks.test.mjs` and `make docs-check`.
- [ ] 7.2 Phase 2 serving rules (D7): a 404 for unknown paths, the sandbox CSP on data-path documents after checking attachments (Chrome's PDF viewer) and the OAuth consent page inside it, `t.html` and `/public/` from the verified set, and the added data paths. Verified by `web/src/sw.test.ts` and `scripts/e2e-signed.mjs`.
- [ ] 7.3 Fold `push-sw.js` into `sw.js`. Verified by `web/src/lib/pushWorker.test.ts`, `push.test.ts` and `make i18n-check`.
- [ ] 7.4 The changed-worker warning (D8), loaded lazily on a worker change. Verified by a happy-dom test with a fake registration.
- [ ] 7.5 Browser end to end with refusal on: v2 with one changed byte refused with the cause and **What to do**; signed v0 refused as older; the refused banner within the safe area (`scripts/e2e-safe-area.mjs`). Verified by `make e2e-signed`.

### 8. Android

- [ ] 8.1 Build `internal/websign/release-keys.json` (or `WEB_SIGNING_PUBKEY`) into the APK. `ShellCache.refresh` reads and verifies `app-manifest.json` (vectors in `ManifestVerifyTest`), with modes per server, no downgrade and an atomic replace; servers without the list keep the `sw.js` reading. Verified by `ShellCacheTest` (tampered file, unknown key, downgrade, self-built, self-built to signed) and `make android`.
- [ ] 8.2 Serve every app file from the verified store, online and offline, with the data-path rules; refuse every service worker request; advertise the `verified-files` capability, so the page skips and removes its worker registration. First measure whether `ServiceWorkerClient` sees the worker's main script, and record the result in design.md D9. Verified by `ShellCacheTest`, a `shell.ts` test for the capability, and an emulator run with a tampered server.
- [ ] 8.3 The native server screen: the signature state, the short fingerprint and Verify. Verified by a unit test of the screen's state (`ShellSignatureTest`), an emulator check, and `docs/android-app.md` updated (`make docs-check`).

### 9. Integration

- [ ] 9.1 `make check` passes, and a fork's release candidate built with the test key shows "Signed with this server's key" in About, then refuses a hand-edited chunk in a real browser and in the Android emulator. Verified by `make check` and the recorded manual run.
