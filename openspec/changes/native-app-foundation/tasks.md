# Tasks

## 1. Platform port (web unchanged)

- [x] 1.1 Add `web/src/lib/platform.ts` (D3) with the web implementation, and route `sync.ts`, `http.ts`, `dates.ts` and `trash.ts` through it (`http.ts` and `ops.ts` needed no change). Verify: `cd web && npm test -- --run`, `npm run build`, and `make bundle-budget`, with the entry chunk +150 B at most and the number reported (entry 146,497 B gzip before and after: +0 B; first load 700,169 B → 700,494 B: +325 B, within its budget).
- [x] 1.2 Add the boundary check (`scripts/shared-boundary.mjs`): it lists browser globals per module of `shared-modules.json` and fails on a new one. Until 4.1, `mobile/app/shared-modules.json` is seeded by hand with the modules of 1.1. Verify: `node --test scripts/repo-checks.test.mjs`, with a case that adds `document.hidden` to a listed module.

## 2. Storage spike (D4)

- [ ] 2.1 Build a throwaway Expo dev build that opens Dexie on candidate A (`fake-indexeddb` persisted to `op-sqlite`) and on candidate B (`indexeddbshim` on SQLite), and loads the `perfseed` 10,000-task account. Verify: a CI artifact with cold start to Today, Inbox and the 500-op pull page for each candidate.
- [ ] 2.2 Record the numbers and the choice in design D4. If neither candidate meets the budgets, write the Dexie-subset adapter plan there before continuing. Verify: the design shows the table.

## 3. App sign-in (server)

- [ ] 3.1 Add the built-in `opentodo-app` client, the `app` scope and refresh-token rotation with reuse detection in `internal/mcpoauth`, with a migration. Verify: `go test ./internal/mcpoauth ./internal/store`.
- [ ] 3.2 Add `GET /app/sign-in` (`signedIn`, confirmation page, redirect to `opentodo://signed-in`) and `POST /api/v1/app/token` (`public("app code exchange")`, rate limit, `.demoDenied()`, a demo deny list entry). Verify: `go test ./internal/httpapi`, covering every error in the table and the scenarios. `policy_test.go` and the demo test pass.
- [ ] 3.3 Treat the `app` scope as `full` in authorization and refuse it on credential and administration routes. Verify: an httpapi test over the route table.
- [ ] 3.4 List app grants in the sessions list. Sign out everywhere, a password change and deactivation revoke them. Verify: httpapi tests, and a web test for the sessions list row.
- [ ] 3.5 Document app sign-in in `docs/api.md` and `docs/security.md` (threat notes: PKCE, scheme interception, rotation). Verify: `make docs-check`.

## 4. The app

- [ ] 4.1 Create `mobile/app`: the Expo app config (`app.config.ts`, bundle id `app.open-todo.preview`, iPhone only), Metro `watchFolders` and the `@shared/*` alias, a strict tsconfig, ESLint with the import restrictions, Jest, `DEPENDENCIES.md`, and `scripts/shared-modules.mjs` with its generated list, which replaces the hand-seeded `shared-modules.json` of 1.2; the modules the generator adds that still use browser globals (among them `attachments`, `db`, `deviceStorage`, `i18n`, `locations`, `shareInbox`, `shell`, `taskOrigin` and `taskPages`) move to the port first. Verify: `make app` (type-check, lint, tests) on Linux.
- [ ] 4.2 Add the app's platform implementation (AppState, NetInfo, MMKV, expo-localization) and `react-native-quick-crypto`. Run the shared vectors for `hlc`, `recurrence`, `nlp`, `e2eeEnvelope` and `flow` in Jest. Verify: `make app`.
- [ ] 4.3 Open the database with the chosen storage candidate, per account and per server, and delete it at sign-out. Verify: a Jest test against the same in-memory engine, plus the kill-after-write Maestro flow on the simulator.
- [ ] 4.4 Add the server screen (address, version check, the error messages from the spec) and sign-in through `expo-web-browser`'s auth session, with tokens in `expo-secure-store` and refresh on 401. Verify: Jest tests for the token logic, and a Maestro flow against a CI server.
- [ ] 4.5 Start sync with the shared engine and the foreground/background lifecycle (D6). Verify: a Maestro flow where a task renamed through the REST API appears in the app without interaction.
- [ ] 4.6 Add a minimal Today screen (native list, complete with haptic) to prove the path end to end. Verify: a Maestro flow where a task completed in the app shows as completed through the REST API.

## 5. CI and distribution

- [ ] 5.1 Add the `app` answer to `scripts/ci-changes.sh`, computed from `shared-modules.json`, with its table of cases in the filter's test. Verify: the filter test covers a web-only change, a shared module change and an app change.
- [ ] 5.2 Add `app-check` (Linux, own cache) to `ci.yml`, plus `app-ios` and `app-android` gated on `mobile/app/` changes. Add the nightly `app-ios`, `app-android` and `app-perf`. Verify: a web-only pull request shows no app job; the timing targets of D9 hold on three consecutive runs.
- [ ] 5.3 Add the `app: native` path to `ios-testflight.yml` (prebuild, archive, upload with the `release` key; register `app.open-todo.preview` through `ios-register-ids.yml`). Verify: a dispatched run uploads a build that Apple marks valid. The owner creates the app record first (owner action).
- [ ] 5.4 Add app budgets to `scripts/perf/budgets.json` and `docs/performance.md`. Verify: the repo check that keeps them equal.
- [ ] 5.5 Write the docs: `docs/app.md` (what the app is, sign-in, what stays on the web), the README's install section, `mobile/README.md`, and `docs/contributing/` (working on the app without a Mac, `make app`). Add the roadmap area. Add `changelog.d/Added/native-app-foundation.md`. Verify: `make docs`, `make docs-check`, `make check`.
