# Proposal

## Why

The people most likely to switch to OpenTodo are heavy users leaving Todoist, TickTick or OmniFocus with years of history: thousands of open tasks, tens of thousands completed. Several competitors are criticised in the research for slowing down with large accounts. OpenTodo's local-first design should make it fast at that size, but today nothing measures it. The 2026-10 large-list work (`large-list-performance`) fixed quadratic paths and added count-based scale tests at 2,000 rows. There's still no time budget, no 10,000-task fixture, no phone measurement and no server memory figure. A 1.0 "Trust" release should be able to say, with numbers, how OpenTodo behaves with 10,000 tasks on a mid-range phone and on a Raspberry Pi.

## What Changes

- **A deterministic 10k fixture.** `internal/perfseed` is a command that's never linked into the server. From a fixed seed it builds a data directory through the op log:
  - one account with 10,000 tasks: 6,000 open, 3,500 completed and 500 in the Trash;
  - 60 projects, one with 2,000 open tasks, 3 of them shared with a second member;
  - 150 sections, 40 labels, 1,500 subtasks;
  - 2,000 tasks with notes (median 400 characters);
  - 3,000 due dates, 400 recurring tasks, 600 reminders;
  - 2,000 comments, 1,000 time entries and 8 saved views.

  An encrypted variant of the same account is included.
- **Published budgets with numbers** in `docs/performance.md`, kept as data in `scripts/perf/budgets.json`. They're measured in three settings:
  - **desktop:** the CI runner in Chromium;
  - **phone profile:** the same runner with 4× CPU throttling and a 412×915 viewport;
  - **reference devices:** a 2022 mid-range Android phone in the Android shell, an iPhone 12 in the iOS shell, and a Raspberry Pi 4 server.

  The main client budgets (desktop / phone profile):
  - cold start to the Today list ≤ 1.2 s / 3 s;
  - opening the 2,000-task project ≤ 400 ms / 1.2 s;
  - a search keystroke p95 ≤ 50 / 150 ms;
  - completing a task, to the next paint, p95 ≤ 50 / 150 ms;
  - first sync of a new device ≤ 30 s / 75 s, with no main-thread task over 200 ms on desktop;
  - JS heap ≤ 150 MB.

  The server budgets:
  - idle RSS ≤ 60 MB, and peak RSS ≤ 150 MB during a full first pull;
  - a 1,000-op pull page p95 ≤ 80 ms;
  - startup ≤ 2 s;
  - the full JSON export ≤ 3 s.
- **Two kinds of check:**
  - **Every PR:** deterministic **count** assertions at 10,000 tasks in the existing "Web scale tests" job and the Go scale tests. These count reads per write, renders per keystroke, queries per pull page and allocations per op, and they can't flake on a slow runner.
  - **Nightly:** a **time** benchmark (`make perf`) runs the browser and server budgets five times and fails when a median exceeds its budget. The failure is reported through the existing nightly alert.
- **Reference-device record.** Before every minor release, the numbers on the reference devices go in `docs/performance/results-<version>.md`. `make release-prepare` refuses a minor release without that record, or with a budget exceeded and no issue linked.
- **Fixes** for whatever the first runs exceed, found by profiling. Windowing long lists stays out unless the budget can't be met without it (see design).

No new environment variable for the server, no runtime dependency, no op schema change. Not **BREAKING**.

## Out of scope

- Accounts beyond 10,000 tasks (tested as a curiosity at 50,000 in the nightly run, reported but not gated).
- Many-tenant scale for host mode (`multi-tenant-host` has its own limits).
- Network conditions: budgets are measured against a local server; the first-sync budget assumes local network speed. A slow-network figure is reported, not gated.
- Battery use.

## Roadmap

Advances ROADMAP-1.0 milestone 1.0 "Trust", item `performance-10k`.

## Capabilities

### New Capabilities

- `performance-budgets`: the 10k fixture, the numeric budgets and where they're published, the count checks on every PR, the nightly time benchmark, and the reference-device record with its release gate.

### Modified Capabilities

None. `task-list-presentation` "Large lists stay responsive", `self-hosting` "Read cost bounded by the visible data" and `offline-first-sync` "Bounded pull pages" keep their requirements; the new capability measures them at 10,000 tasks.

## Impact

- **Data model, sync, op schema, E2EE:** none. Fixes may add IndexedDB indexes (Dexie schema version bump, local only) or SQLite indexes (a migration). Each is listed in tasks when found.
- **API/CLI/MCP:** none.
- **Web app:** `performance.mark` calls at a few milestones (list ready, search results, sync done). They're local to the browser and never sent anywhere (no telemetry).
- **CI:** the web scale job grows from 2,000 to 10,000 rows (about +2 minutes). There's a new nightly `perf` workflow (about 20 minutes).
- **Binary and bundle size:** no change from the harness. Fixes are checked by `bundle-budget`.
