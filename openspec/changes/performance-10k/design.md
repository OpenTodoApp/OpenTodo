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

These numbers come from industry guidance (RAIL: 100 ms response, 50 ms tasks; INP "good" ≤ 200 ms) and from margin over today's 2,000-row measurements. They're checked against a first measurement in task 1.6, and any number that's unachievable without a design change is raised there with a reason. A budget is only raised in a PR that states why, like `bundle-budget.json`.

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

**D7. The notes fixture and its budgets.** Notes are the one kind of data whose log grows much faster than its current value: every save writes a full Yjs state of up to 256 KB plus its projection (docs/sync.md "Mergeable documents"). The 10k fixture's 2,000 short notes don't exercise that, so a second, nightly-only fixture adds it.

- **Composition** (`perfseed -notes`, on top of the 10k account): 500 notes growing to about 10 KB of text each (about 14 KB encoded documents), 250 standalone notes (task notes on the 10k account's tasks until `notes-overview` lands) and 250 task notes; each saved about 300 times, the saves spread over twelve months on 20 distinct days per note; 450 notes last edited more than 30 days ago and 50 edited within the last 30 days (30 of their saves inside the window). The documents are real Yjs updates produced by a small Node script from a fixed seed (`scripts/perf/notes-seed.mjs`), since the server never builds documents; perfseed writes them through `ApplyStrict` while stepping the sync service's clock, so `received_at` and `ts` are spread over the year like real history.
- **Size before compaction:** about 2 GB of log. It's generated on the nightly runner only (about 15 minutes, about 5 GB of disk with the one-time conversion's copy), never on every PR.
- **The run:** generate, start the server, let the compaction job run to completion (the conversion included), then measure. The nightly report also records the database size before compaction and the number of ops and bytes compaction removed (from the job's report), so a regression in compaction shows as a size jump.

| Metric (notes fixture) | Desktop | Phone profile | Reference device |
|---|---|---|---|
| Database file after compaction and incremental vacuum | 250 MB (server) | — | Pi 4: same |
| Notes' share of the database (winners plus the 30-day window plus one revision per day) | 100 MB (server) | — | — |
| Full compaction of the fixture, sum of runs | 120 s (server) | — | Pi 4: ×4 |
| Longest wait of a push behind a compaction chunk | 100 ms (server) | — | — |
| First sync of a new device, sign-in → all tasks and notes local | 45 s | 110 s | 120 s |
| Bytes pulled by that first sync (reported, not gated) | — | — | — |
| IndexedDB usage after that sync (`storage.estimate`) | 120 MB | — | recorded |
| Open the Notes page → list ready (after `notes-overview`) | 400 ms | 1,200 ms | 1,200 ms |
| Note search keystroke → results updated, p95 (after `notes-overview`) | 50 ms | 150 ms | 150 ms |
| JS heap after the notes session | 170 MB | 170 MB | — |

How the numbers were set: the notes' share is the 500 winning documents and projections (about 12 MB), the window's saves of the 50 recent notes (about 35 MB) and one projection per editing day for the rest (about 45 MB), rounded up; the first sync adds that share to the 10k account's 30 s / 75 s; IndexedDB holds one document and one projection per note (about 12 MB) on top of the 80 MB budget, with margin for Dexie's overhead. As with the other budgets, task 1.6's first measurement may adjust them only with a reason.

**If the phone budgets fail.** The owner's plan (DECISIONS.md, "Notes storage safety", item 4) defers lazy note bodies (`notes-on-demand`: devices receive the projection and fetch the document when a note opens) until these numbers show phones need it. A failing first-sync or IndexedDB budget on the phone profile or a reference phone after compaction is that signal: task 3.3 then proposes `notes-on-demand` as its own OpenSpec change instead of raising the budget.

## Data model impact

None from the harness. Index additions are local (Dexie) or a SQLite migration; neither changes the op schema.

## Size and memory

No runtime dependency (Playwright is already a dev dependency for ui-check; the notes seed script uses the web app's existing `yjs` dependency). The marks add under 1 KB to the bundle. The server binary is unchanged; `internal/perfseed` isn't linked.

## Interface budget

No screen changes from this change. Fixes keep the screens as they are.

## Progressive disclosure

Nothing user-visible.

## Open questions for the owner

- Reference devices: which Android phone and iPhone the project owns or can borrow for the per-release run.
- Whether to also gate the nightly 50,000-task run later. It's reported only for now.
- The notes budgets (D7) are first estimates from the fixture's composition. Default chosen: gate them nightly from the start and adjust after task 1.6's first measurement, like the others.
