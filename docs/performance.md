---
title: Performance budgets
summary: How fast OpenTodo is with 10,000 tasks: the budgets for the app, phones and the server, the test account, how they are checked and the latest results.
audience: developer
section: Internals
specs: []
screens: []
order: 40
---
# Performance budgets

OpenTodo is meant to stay fast for people who arrive with years of history:
thousands of open tasks and tens of thousands done. These pages give the
numbers it is held to with a 10,000-task account, on a computer, in a phone
profile and on a small server, and how they are checked.

- [The test account](#the-test-account)
- [Budgets](#budgets)
- [How the budgets are checked](#how-the-budgets-are-checked)
- [Run the benchmark yourself](#run-the-benchmark-yourself)
- [Latest results](#latest-results)

## The test account

`perfseed` (`go run ./cmd/perfseed -data <empty directory>`) builds the same
account from a fixed seed every time, through the operation log, so a device
signs in to it by ordinary sync:

| What | How many |
| --- | --- |
| Tasks | 10,000: 6,000 open, 3,500 completed, 500 in the Trash |
| Projects | 60, one holding 2,000 open tasks, 3 shared with a second member |
| Sections, labels | 150, 40 |
| Subtasks | 1,500 |
| Tasks with notes | 2,000 (median 400 characters) |
| Due dates, recurring tasks, reminders | 3,000, 400, 600 |
| Comments, time entries, saved views | 2,000, 1,000, 8 |

`-encrypted` builds the same account with end-to-end encryption on, and
`-scale 5` a 50,000-task account (measured at night, not held to a budget).
The command is a development tool: it is not part of the server.

## Budgets

The limits live in [`scripts/perf/budgets.json`](../scripts/perf/budgets.json);
these tables show the same values, and a repository check fails when the two
differ. A limit is raised only in a change that says why.

An interaction is timed from the input to the frame after its change, so even one
that does nothing measures about a frame. The interaction limits follow common
response-time guidance: on a computer the cursor within three frames (50 ms) and a
completion or keystroke within 100 ms; in the phone profile 150 ms for the cursor and
200 ms for a completion or keystroke.

The settings:

- **Desktop**: Chromium on the CI runner.
- **Phone profile**: the same runner with the CPU slowed four times and a
  412 × 915 screen.
- **Android, iPhone**: a 2022 mid-range Android phone in the Android app and an
  iPhone 12 in the iOS app, measured by hand before each minor release.
- **Server**: the server binary on the CI runner; **Raspberry Pi 4** (4 GB,
  arm64 image) is measured by hand, with four times the server's limits.

### The app

| Metric | Unit | Desktop | Phone profile | Android | iPhone |
| --- | --- | --- | --- | --- | --- |
| `cold-start` Cold start with the data on the device, to the Today list | ms | 1,200 | 3,000 | 3,000 | 3,000 |
| `open-project` Open the 2,000-task project, to the list | ms | 400 | 1,200 | 1,200 | 1,200 |
| `search-keystroke` A keystroke in search, to the updated results (95th percentile) | ms | 100 | 200 | 150 | 150 |
| `saved-view` A saved view of eight clauses, to the list | ms | 100 | 300 | — | — |
| `complete-task` Completing a task in the 2,000-row list, to the next frame (95th percentile) | ms | 100 | 200 | 150 | 150 |
| `cursor-move` Moving the cursor with j or k, to the next frame (95th percentile) | ms | 50 | 150 | — | — |
| `first-sync` First sync of a new device, sign-in to all 10,000 tasks on it | s | 30 | 75 | 90 | 90 |
| `first-sync-long-task` Longest main-thread task during that sync | ms | 200 | — | — | — |
| `remote-edit` An edit on another device, painted here | ms | 1,000 | — | — | — |
| `js-heap` JavaScript heap after the session | MB | 150 | 150 | — | — |
| `indexeddb` Storage the app uses on the device | MB | 80 | — | — | — |
| `app-memory` Memory of the app's process | MB | — | — | 350 | 350 |

### The server

| Metric | Unit | Server | Raspberry Pi 4 |
| --- | --- | --- | --- |
| `server-start` Start to healthy | ms | 2,000 | 8,000 |
| `server-idle-rss` Memory when idle | MB | 60 | 240 |
| `server-pull-rss` Peak memory during one device's first sync | MB | 150 | 600 |
| `server-export-rss` Peak memory during the JSON export | MB | 200 | 800 |
| `server-pull-page` A sync page of 1,000 operations (95th percentile) | ms | 80 | 320 |
| `server-push` A push of 100 operations (95th percentile) | ms | 100 | 400 |
| `server-list-project` `GET /api/v1/tasks?project_id=` of the 2,000-task project (95th percentile) | ms | 150 | 600 |
| `server-get-task` `GET /api/v1/tasks/{id}` (95th percentile) | ms | 10 | 40 |
| `server-export` The full JSON export | ms | 3,000 | 12,000 |
| `server-mcp-search` The MCP `search_tasks` tool (95th percentile) | ms | 200 | 800 |
| `server-db-size` The database file | MB | 150 | 150 |

### With a year of note history

The notes fixture adds 500 notes of about 10 KB each to the account, half
standalone notes and half task notes, each saved about 300 times over twelve
months (about 2 GB of history before the server's
[compaction](backups.md) runs). It is built and measured on demand (a manual run of the Performance workflow); it joins the nightly run once compaction meets its budgets: the first full run (2026-11-03) finished no compaction pass in 20 minutes, and a write waited 4.4 s behind it.

| Metric | Unit | Server | Desktop | Phone profile | Android | iPhone | Raspberry Pi 4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `notes-db-size` The database file after compaction | MB | 250 | — | — | — | — | 250 |
| `notes-share` What the notes take of it | MB | 100 | — | — | — | — | — |
| `notes-compaction` A full compaction of the fixture | s | 120 | — | — | — | — | 480 |
| `notes-push-wait` The longest a write waits behind compaction | ms | 100 | — | — | — | — | — |
| `notes-first-sync` First sync of a new device, tasks and notes | s | — | 45 | 110 | 120 | 120 | — |
| `notes-indexeddb` Storage on the device after that sync | MB | — | 120 | — | — | — | — |
| `notes-page` Open the Notes page | ms | — | 400 | 1,200 | 1,200 | 1,200 | — |
| `notes-search` A keystroke in the note search (95th percentile) | ms | — | 50 | 150 | 150 | 150 | — |
| `notes-js-heap` JavaScript heap after the notes session | MB | — | 170 | 170 | — | — | — |

The report also gives, without a limit, the database size before compaction,
the operations and bytes compaction removed, and the bytes a new device pulls.
If a phone misses its first-sync or storage budget after compaction, the answer
is loading note bodies on demand, not a higher budget.

`NOTES=1 make perf` runs it (`NOTES_SEED_FLAGS="--notes 50"` for a quick look).

## How the budgets are checked

**On every pull request**, tests count work at 10,000 tasks instead of
timing it, so a slow runner cannot make them fail:

- opening Today reads the tasks table at most once, a search keystroke reads
  nothing from the device's database, and completing a task in a 2,000-row list
  draws at most three rows again (`web/src/app/scale10k.perf.test.tsx`, CI's web
  scale tests);
- each page of a first sync is written in one local transaction, and two
  devices that receive the same operations in different orders end with the
  same rows;
- a sync page runs as many database statements with 60 projects as with one,
  a push runs a bounded number per operation (`internal/perfseed`), and the
  export allocates a bounded amount per task (`internal/httpapi`).

**Every night** the benchmark times every desktop, phone-profile and server
metric five times and fails when a median is over its limit; the nightly alert
names the metric, the median and the limit ("first sync, desktop, 41 s,
budget 30 s").

**Before each minor release** the device budgets are measured on the reference
phones and a Raspberry Pi 4 ([scripts/perf/device.md](../scripts/perf/device.md))
and recorded in `docs/performance/results-<version>.md`.

The app marks a few moments in the browser's own performance timeline
(`ot:list-ready`, `ot:search-results`, `ot:sync-idle`, `ot:remote-applied`). The
benchmark reads them there; they are never sent anywhere.

## Run the benchmark yourself

```sh
make perf            # builds the app, the server and the account, then runs every budget five times
PERF_RUNS=1 make perf   # one run, for a quick look
```

It needs Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`)
and Linux for the server's memory figures. The report is written to
`perf-report/` (`server.json`, `web.json`).

## Latest results

Reference-device results are recorded per release in `docs/performance/`. No
release has a record yet; the first is due before 1.0.
