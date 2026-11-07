# Tasks

This change is design only until the maintainer approves it. Implementation starts after 1.0 (owner decision of 2026-11-06). Backend tasks run `go test ./...`. Frontend tasks run `npm test` and `npm run build` in `web/`. `make check` runs before the last task.

## 0. Decisions

- [ ] 0.1 The maintainer answers questions 1 to 6 in design.md, and the answers are folded into design.md, the specs and these tasks. Verified by `make openspec-validate` and the maintainer's approval on the pull request.
- [ ] 0.2 Generate the release key and the recovery key offline with `websign keygen` (after 1.1). Store the release key as the `web-signing` environment secret, limited to `v*` tags (with a required reviewer if question 2 says so), and keep the recovery key offline as question 3 decides. Verified by `gh api repos/OpenTodoApp/OpenTodo/environments/web-signing` showing the tag rule, and by the two public keys in `web/release-keys.json`.

## 1. Signing tool and shared vectors

- [ ] 1.1 `internal/websign`: the manifest and envelope types, the domain string, ECDSA P-256 sign and verify, raw r||s signatures, fingerprints (full and short), and semver precedence; standard library only. Verified by `go test ./internal/websign`.
- [ ] 1.2 `cmd/websign` with `keygen`, `sign <dist>` (refuses files that don't match the list, and a version that doesn't match the tag) and `verify <dist|url>`. Verified by `go test ./cmd/websign` round trips and a tampered-file refusal.
- [ ] 1.3 Shared vectors `internal/websign/testdata/vectors.json` (valid, bad signature, unknown key, wrong domain, mutated payload, two signatures, recovery key) and the test key `internal/websign/testdata/test-key.pem`; listed in `docs/contracts.md`. Verified by `TestVectors` and `make docs-check`.
- [ ] 1.4 A test that keeps the signing half out of the server binary, like `TestServerDoesNotLinkCrypt` in `internal/e2ee/crypt`. Verified by `go test ./internal/websign`.

## 2. Build and server

- [ ] 2.1 A Vite plugin writes the unsigned `app-manifest.json` after the bundle, listing every file in `dist` as `install` or `lazy`, the worker's hash and the build's key set: `web/release-keys.json`, or the public key of `WEB_SIGNING_KEY`. With `WEB_SIGNING_KEY` set, `make web` signs. Verified by a vitest test of the plugin on a fixture build, and by `make web` then `go run ./cmd/websign verify internal/web/dist`.
- [ ] 2.2 `internal/web`: `/index.html` served unmodified, `app-manifest.json` with `no-store`, and `no-transform` on every app file. Branded and `noindex` navigations unchanged. Verified by `go test ./internal/web` and `TestSecurityHeaders`.
- [ ] 2.3 The server logs the build's signature state and short fingerprint at startup, and warns when the embedded files don't match their list. Verified by a `go test ./internal/tenant` log assertion.
- [ ] 2.4 The Dockerfile accepts the BuildKit secret `web_signing_key` and a `web-dist` build context. Verified by `docker build --secret id=web_signing_key,src=internal/websign/testdata/test-key.pem .` followed by `websign verify` against the running container.
- [ ] 2.5 Self-hosting docs: the own-key setting, proxies that rewrite files, `websign verify`, and rolled-back servers. Verified by `make docs-check`.

## 3. The verifier worker

- [ ] 3.1 Replace Workbox in `web/src/sw.ts` with the verifier: the trust record in its own IndexedDB database, first-use modes and the ratchet (D5), the update check, staging and the atomic switch (D6), and the previous set kept for open tabs. Fold `push-sw.js` into the worker. Remove `workbox-core`, `workbox-precaching` and `workbox-routing`. Verified by `web/src/sw.test.ts`: valid update installed; tampered chunk refused; interrupted download leaves `current`; older and equal-but-different versions refused; unsigned refused in signed mode; self-built moves to signed; offline makes no check.
- [ ] 3.2 Serving rules (D7): only verified files, lazy files checked on first load, a 404 for unknown paths, no scripts or styles from data paths, sandboxed data-path documents, `t.html` and `/public/` from the verified set, and the CSP from the build with only the server's `connect-src` origins. A shared fixture keeps the policy equal to Go's `cspBase`. Verified by `web/src/sw.test.ts` and `go test ./internal/httpapi -run TestSecurityHeaders`.
- [ ] 3.3 Signing out and the revoked-device wipe keep the trust record. Verified by `web/src/lib/revocation.test.ts` and a `sw.test.ts` case.
- [ ] 3.4 The worker's tests read the shared vectors. Verified by `web/src/sw.verify.test.ts`.
- [ ] 3.5 The reminder push tests still pass with the push code inside the worker. Verified by `web/src/lib/pushWorker.test.ts` and `push.test.ts`.

## 4. Page and Settings

- [ ] 4.1 `appUpdate.ts` and `UpdateBanner`: the worker's `ready` and `refused` messages, the two refusal texts, a close button for refusals, each list announced once. Verified by `web/src/lib/appUpdate.test.ts` and an `UpdateBanner` story in both refused states.
- [ ] 4.2 The page applies the branded title and icons from `branding.ts` on start. Verified by `web/src/lib/branding.test.ts`.
- [ ] 4.3 The changed-worker warning (D8), loaded lazily on a worker change. Verified by a happy-dom test with a fake registration.
- [ ] 4.4 Settings → About: the "App code" row in its states (D10), the version the device runs, the Security page link and Verify. The copy goes in `settingsCopy.ts` and every catalog. Verified by `aboutShell.test.tsx`, the About story's baselines (`make ui-check`) and `make i18n-check`.
- [ ] 4.5 Measure the first load. Raise `web/bundle-budget.json` only if it passes 687 KB, and name this change in the comment. Verified by `make bundle-budget`.

## 5. Android

- [ ] 5.1 Build `web/release-keys.json` (or `WEB_SIGNING_PUBKEY`) into the APK. `ShellCache.refresh` reads and verifies `app-manifest.json` (vectors in `ManifestVerifyTest`), with modes per server, no downgrade and an atomic replace. Verified by `ShellCacheTest` (tampered file, unknown key, downgrade, self-built, self-built to signed) and `make android`.
- [ ] 5.2 Serve every app file from the verified store, online and offline, with the data-path rules; refuse every service worker request; advertise the `verified-files` capability, so the page skips and removes its worker registration. First measure whether `ServiceWorkerClient` sees the worker's main script, and record the result in design.md D9. Verified by `ShellCacheTest`, a `shell.ts` test for the capability, and an emulator run with a tampered server.
- [ ] 5.3 The native server screen: the signature state, the short fingerprint and Verify. Verified by a unit test of the screen's state (`ShellSignatureTest`), an emulator check, and `docs/android-app.md` updated (`make docs-check`).

## 6. iOS

- [ ] 6.1 The native check on launch and resume with CryptoKit, and the alert (D9). Verified by `ManifestVerifyTests` on the shared vectors and `make ios`.

## 7. Release and documentation

- [ ] 7.1 The `web-sign` job in `.github/workflows/ci.yml`: tags only, the only job in the `web-signing` environment, its output feeding the image and the binaries; the image smoke test runs `websign verify`; the release attaches `app-manifest.json`. Verified by `scripts/repo-checks.test.mjs` (only `web-sign` uses the environment, official fingerprints match SECURITY.md and the docs, the test key is never official) and a release candidate tag on a fork.
- [ ] 7.2 Browser end to end, `scripts/e2e-signed.mjs`: v1 installed; v2 with one changed byte refused; valid v2 accepted; signed v0 refused; offline reload from the verified set; the refused banner within the safe area (`scripts/e2e-safe-area.mjs`). Verified by `make e2e`.
- [ ] 7.3 Threat model, limits, `docs/e2ee.md`, SECURITY.md and the new `docs/security/signed-app.md`, with the texts of design D14; `docs/security/how-we-verify.md` names the tests. Verified by `make docs` and `make docs-check`.
- [ ] 7.4 Website (`OpenTodoWebsite`): the fingerprints on the Security page, anchored at `#app-signing`, and the static `/security/verify` page that compares the address fragment. Verified by that repository's build and a manual check with a known and an unknown fingerprint.
- [ ] 7.5 The changelog fragment `changelog.d/Security/signed-web-app.md`, and the `external-security-review` item 6.13d pointing to this change. Verified by `make repo-check`.

## 8. Integration

- [ ] 8.1 `make check` passes, and a fork's release candidate built with the test key shows "Signed with this server's key" in About, then refuses a hand-edited chunk in a real browser and in the Android emulator. Verified by `make check` and the recorded manual run.
