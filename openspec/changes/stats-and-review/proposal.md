# Statistics and weekly review

## Why

OpenTodo shows what is open and what is next, never what happened: there is no count of tasks completed this week, no view of what slipped, and the weekly review that the website's guide recommends (`/home/user/OpenTodoWebsite/src/content/guides/weekly-review.md`) has to be assembled by hand from a template project and a saved view. Todoist's karma and productivity view, TickTick's statistics and Things' logbook are the parity gap people name when they switch. The data is already on every device: completed tasks keep `completed_at` and, since `completed-date-filters`, `completed_by`; recurring completions leave occurrence records (`recurring-tasks` "Convergent completion across devices", `web/src/lib/recurring.ts:25-75`), and projects, due dates and the Inbox are local rows in Dexie (`web/src/lib/db.ts:253-271`). Nothing needs to be sent anywhere to compute it.

## What Changes

- **Statistics, computed on the device.** A Statistics screen (`/stats`, <kbd>g</kbd> then <kbd>Shift+S</kbd>) shows, for this week, last week, the last four or twelve weeks: tasks completed (including recurring occurrences), created, completed late, and slipped (due in the period, still open at its end); completions per day, per weekday and per project; what is overdue now. Weeks start on the user's first day of the week, resolved by the same period code as the filter grammar's `this week` / `last week`. A habit's skipped occurrence is never counted. In shared projects a completion counts for whoever completed it (`completed_by`), with the assignee as the fallback for older rows. Everything is derived from local rows at render time, works offline, writes nothing, and sends nothing to the server. Encrypted accounts get the same numbers: only plaintext fields are counted and names are decrypted on the device as everywhere else.
- **A guided weekly review.** A Review screen (`/review`, <kbd>g</kbd> then <kbd>r</kbd>) walks the four steps of the website's guide with live data inside each: get clear (the Inbox), look back (completed this week, overdue tasks with the usual row actions), next actions (every live project you can edit that has no open task, with "add a next action" or "archive"), look ahead (the next seven days, pick priorities). Each step shows whether it is done; "Finish review" records the time. The record is a new personal entity `review` written through the op log, so every device shows when the last review was and the sidebar marks a review as due after seven days.
- **An optional weekly digest by email.** Built on `outgoing-email` (shipped: `internal/mail`). Per user, opt-in in Settings → Notifications, on the chosen weekday and hour in the user's time zone: last week's numbers, overdue tasks, what is due in the next seven days, projects without a next action, and a link to the review. Never offered to accounts with end-to-end encryption; nothing without outgoing email; refused on the demo. The digest's numbers use the same definitions as the Statistics screen, pinned by a shared fixture, so the mail and the screen never disagree.

Out of scope:
- Streaks and skip-without-breaking-the-chain on recurring tasks, and any heat-map per habit: they shipped with `habits` (roadmap row 19). The roadmap row for this change mentions streaks; this proposal records that they are not here.
- A rescheduling count ("moved three times"): it needs the server's op history (`GET /api/v1/tasks/{id}/history`, online only) and is not computable from local rows; "slipped" and "completed late" are the local, honest measures.
- Goals, points, levels, or any gamification; sharing statistics with other members; statistics per member in shared projects.
- A daily digest (roadmap row 9 mentions one): the digest here is weekly, on the review day; the setting's frequency is an enumeration so `daily` can be added additively later.
- Time tracking or estimates versus actuals (`time-blocking` holds estimates only).

ROADMAP: advances row 12 of "Next: Parity and depth" (`stats-and-review`). Refinements recorded: streaks deferred to `habits`; "slipped" defined locally; the digest is weekly and specified here rather than in `outgoing-email`.

Nothing here is **BREAKING**: one additive entity in the op log (an older server rejects its ops as unknown, as for every new entity; the client keeps the local value), no environment variable, no dependency.

## Capabilities

### New Capabilities
- `statistics`: the on-device statistics: what is counted and how, the periods, the charts, the privacy and offline guarantees, and the Statistics screen.
- `weekly-review`: the guided review: its steps and their done conditions, the `review` entity and its sync, the Review screen, the sidebar marker and the keyboard path.
- `email-digest`: the opt-in weekly digest mail: its settings route, schedule, content, the shared definitions with `statistics`, and its refusals (no outgoing email, encrypted accounts, demo).

### Modified Capabilities
- `web-app`: the keyboard navigation chords gain <kbd>g</kbd> <kbd>r</kbd> (Review) and <kbd>g</kbd> <kbd>Shift+S</kbd> (Statistics).

## Impact

- **Op schema:** a new personal entity `review` (field `completed_at`, integer milliseconds) in `internal/sync/ops.go` `Schema`, resolved to the personal scope by the default branch of `internal/sync/scope.go:290-296`; `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`, a Dexie table in `web/src/lib/db.ts` (the next free version), the entity maps in `lib/e2eeSync.ts` and `lib/assistant.ts`, the JSON export, `docs/sync.md`, and the activity fixture (no event). Not user-written content: stays out of `e2ee.ContentFields` and `CONTENT_FIELDS`.
- **Web:** `web/src/lib/stats.ts` (pure definitions, reusing the period resolution of `lib/filter`), `web/src/lib/review.ts` (steps and done conditions), `StatsView` with inline SVG charts, `ReviewView` on the `Tabs` primitive and the existing task rows, router entries `/stats` and `/review`, two `go` entries in the shortcut registry bound in `Shell.tsx`, a sidebar entry, the digest card in `NotificationsSettings`, `lib/api.ts` methods, keyboard help and docs.
- **Server:** the schema entry; `internal/digest` (settings store, scheduler, content builder on `sync.List`) with one migration for `email_digests`; routes `GET` / `PUT /api/v1/me/email-digest` (the `PUT` on the demo deny list); a `digest` message kind in `internal/mail` templates (six languages); wiring in `cmd/opentodo/main.go` under the leader-only jobs.
- **Docs:** new user guide page `docs/review-and-statistics.md`, `docs/keyboard.md`, `docs/settings.md` (Notifications), `docs/notifications.md`, `docs/sync.md`, `docs/api.md`, `docs/self-hosting/outgoing-email.md` (digest paragraph), `docs/README.md` index.
- **Size:** no dependency. Charts are inline SVG. The Statistics and Review screens are lazy-loaded like the assistant settings, so the main bundle grows by about 3 kB (the sidebar entry, chords and `review` entity); the lazy chunk is about 25 kB minified (7 kB gzip). Go: about 600 lines plus six digest templates; one 5-minute ticker goroutine on the jobs leader; memory unchanged otherwise.
