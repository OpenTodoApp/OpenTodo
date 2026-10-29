# Design

## Context

- `web/vitest.perf.config.ts` runs `*.perf.test.ts(x)` (the list at 2,000 rows, the encryption migration). They assert counts, not times, in CI's "Web scale tests" job.
- The Go side has `internal/sync/scale_test.go`, `querycost_test.go` and `grants_bench_test.go`.
- Pull pages are bounded: at most 1,000 ops and about 4 MB (`offline-first-sync` "Bounded pull pages"). With roughly 15 field ops per task, 10,000 tasks is about 150,000 ops, or about 150 pages for a first sync.
- `scripts/bundle-budget.mjs` with `web/bundle-budget.json` is the model for a budget file that's raised only on purpose, with the reason given in the PR.
- The nightly workflow exists, and failures are reported by `scripts/nightly-alert.sh`.

## Decisions

**D1. The fixture is generated, not committed, and goes through the op log.** `internal/perfseed` (package plus `cmd/perfseed`, never imported by the server; a test like the vault's keeps it out) creates the account with the composition in the proposal. It uses a seeded PRNG and `sync.Service.ApplyStrict` with device `perfseed`, so the data has a real op history and real materialized rows.

- Output: a data directory, plus a JSON summary of counts and ids (the big project, a search term with 37 hits, a saved view).
- Runtime target: under 60 s on the CI runner.
- The encrypted variant encrypts content fields with a fixed test key through `internal/e2ee/crypt`, the same format the client uses. It measures decrypt cost on the client.

Alternative: a committed SQLite file. Rejected: about 60 MB, and it would rot as the schema grows.

Alternative: seed through the REST API. Rejected: slower, and it adds nothing the op path doesn't cover.

**D2. Budgets as data, three settings.** `scripts/perf/budgets.json` holds each metric with its unit, its setting (`desktop`, `phone`, `server`, `device-android`, `device-ios`, `pi4`) and its limit. `docs/performance.md` renders the same table, and a repo check keeps the two equal. The limits:

| Metric | Desktop | Phone profile | Reference device |
|---|---|---|---|
| Cold start (data local) → Today list ready | 1,200 ms | 3,000 ms | 3,000 ms |
| Open the 2,000-task project → list ready | 400 ms | 1,200 ms | 1,200 ms |
| Search keystroke → results updated, p95 | 50 ms | 150 ms | 150 ms |
| Saved view (8-clause query) evaluated | 100 ms | 300 ms | — |
| Complete a task in the 2,000-row list → next paint, p95 | 50 ms | 150 ms | 150 ms |
| Cursor move `j`/`k` → next paint, p95 | 16 ms | 50 ms | — |
| First sync of a new device (sign-in → all 10,000 tasks local) | 30 s | 75 s | 90 s |
| Longest main-thread task during first sync | 200 ms | — | — |
| Remote edit → other device paints (live channel, local server) | 1,000 ms | — | — |
| JS heap used after the scripted session | 150 MB | 150 MB | — |
| IndexedDB usage (`storage.estimate`) | 80 MB | — | — |
| App process memory (PSS / footprint) | — | — | 350 MB |

Server, on the CI runner (×4 allowed on the Pi 4, recorded, not gated in CI):

| Metric | Limit |
|---|---|
| Start → healthy | 2 s |
| Idle RSS after start | 60 MB |
| Peak RSS during one device's full first pull | 150 MB |
| Peak RSS during the JSON export | 200 MB |
| Pull page of 1,000 ops, p95 | 80 ms |
| Push of 100 ops, p95 | 100 ms |
| `GET /api/v1/tasks?project_id=<2,000-task project>`, p95 | 150 ms |
| `GET /api/v1/tasks/{id}`, p95 | 10 ms |
| Full JSON export | 3 s |
| MCP `search_tasks`, p95 | 200 ms |
| Database file size | 150 MB |

These numbers come from industry guidance (RAIL: 100 ms response, 50 ms tasks; INP "good" ≤ 200 ms) and from margin over today's 2,000-row measurements. They're checked against a first measurement in task 1.4, and any number that's unachievable without a design change is raised there with a reason. A budget is only raised in a PR that states why, like `bundle-budget.json`.

**D3. PR checks count, nightly checks time.** Time on shared CI runners varies by ±30%, so blocking PRs on time would flake. Every PR runs counts at 10,000 tasks:

- **Web** (`*.perf.test.tsx`, raised from 2,000 to 10,000):
  - opening Today reads the tasks table at most once;
  - a search keystroke reads IndexedDB zero times (it uses the in-memory snapshot);
  - completing a task re-renders at most 3 rows;
  - the first sync applies each page in one Dexie transaction.
- **Go** (`internal/sync/scale_test.go`, `querycost_test.go`):
  - a pull page runs a constant number of queries, whatever the account size;
  - a push of 100 ops runs O(1) statements per op;
  - the export streams with a bounded allocation count per task (`testing.AllocsPerRun`).

The nightly `perf` workflow builds the server, runs perfseed, and runs `scripts/perf/run.mjs` (Playwright, Chromium, desktop and phone profile) and `go test -tags perf ./internal/perf/...` (server metrics, RSS read from `/proc/<pid>/status`). Each metric runs 5 times, the median is compared with its budget, and any excess fails the job. The JSON report is uploaded, and failures go through `nightly-alert.sh`. `make perf` runs the same thing locally.

**D4. Measurement points in the app, local only.** The app calls `performance.mark('ot:list-ready')` when a list's first rows are committed, `ot:search-results` when search results render, `ot:sync-idle` when the first sync finishes, and `ot:remote-applied` when a pulled batch is painted. The harness reads them with `performance.getEntriesByName`. Nothing leaves the browser: no telemetry, no endpoint. The marks cost microseconds and stay in production builds, so the reference-device runs measure the real app.

**D5. Reference devices before every minor release.**

- Android: a 2022 mid-range phone (Pixel 6a or Galaxy A54 class) running the Android shell.
- iOS: an iPhone 12 running the iOS shell.
- Server: a Raspberry Pi 4 (4 GB) running the arm64 image.

`scripts/perf/device.md` gives the steps: the shells open a debug page that runs the same scripted session and shows the marks, and memory comes from the platform tools. Results go in `docs/performance/results-<version>.md`. `release-prepare` refuses a minor release without the file, or with a value over budget that doesn't link an issue.

**D6. Fix strategy.** First runs decide the work. Candidates, in order of preference:

- **missing IndexedDB indexes**, via a Dexie version bump;
- **first-sync batching**, so pages apply inside one transaction and paint less often;
- **search**, an in-memory title and notes index built once from the live snapshot;
- **decrypt cost**, with decrypt-on-demand for notes in encrypted accounts;
- **windowing** for lists over 2,000 rows, only if the cursor and completion budgets can't be met otherwise. `large-list-performance` D3 records why windowing is risky (keyboard focus, drag and drop, find-in-page). A windowing change would get its own OpenSpec change.

## Data model impact

None from the harness. Index additions are local (Dexie) or a SQLite migration; neither changes the op schema.

## Size and memory

No runtime dependency (Playwright is already a dev dependency for ui-check). The marks add under 1 KB to the bundle. The server binary is unchanged; `internal/perfseed` isn't linked.

## Interface budget

No screen changes from this change. Fixes keep the screens as they are.

## Progressive disclosure

Nothing user-visible.

## Open questions for the owner

- Reference devices: which Android phone and iPhone the project owns or can borrow for the per-release run.
- Whether to also gate the nightly 50,000-task run later. It's reported only for now.
