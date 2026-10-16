# Design: statistics and weekly review

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Everything needed is a local row.** Dexie holds `tasks` (indexed on `completed_at`, `project_id`, `assignee_id`, `section_id`; `web/src/lib/db.ts:253-271`) with `created_at`, `completed_at`, `deleted_at`, `due`, `series_id`, `recurrence` and `project_id` (`web/src/lib/types.ts:53-93`), `projects` with `archived` and `deleted_at`, and `memberships`. The client never prunes completed tasks; only the server's Trash retention purges trashed items (`trash-and-history` "Automatic purge after retention"). Recurring completions are ordinary task rows with `series_id` and an id derived from series and date (`web/src/lib/recurring.ts:25-75`, `ids.occurrenceId`).
- **Who completed a task is on the row since `completed-date-filters`.** Tasks carry `completed_by` (the account that completed it, written in the same batch as `completed_at`; null on rows completed before the field existed and on public-link ticks). Rows also know `assignee_id`. Rescheduling history lives only on the server (`GET /api/v1/tasks/{id}/history`, online).
- **Periods and week start already exist.** The filter grammar of `completed-date-filters` resolves `this week`, `last week` and friends with the user's first day of the week (`resolveRange` in `web/src/lib/filter/parse.ts`, `weekStart` from the `date-time-preferences` snapshot); the Completed view is a day-grouped logbook (`web/src/lib/logbook.ts`).
- **Habits are shipped.** A habit's skipped occurrence is an occurrence record with `skipped: true` (`habits` D2); it is not a completion anywhere (the filter's `completed`, the logbook, `for N times`). Streaks and the month history belong to `habits`.
- **Precedents.** Auto-archive already evaluates "projects with no open task" from local rows and archives through an op (`web/src/lib/archive.ts:27-60`). Per-person synced preferences use a personal entity keyed `"me"` with only a `Schema` entry on the server (`date-time-preferences` D1; `internal/sync/scope.go:290-296` default branch). Dashboards render saved-view counts live (`custom-views` "Dashboards"). Shared Go/TS behaviour is pinned by a fixture (`internal/activity/testdata/activity_fixture.json`).
- **Server reads for mail.** The push scheduler reads materialized rows per user with `sync.Get` and drops ciphertext titles (`internal/push/service.go:270-330`); `sync.List(ctx, userID, entity, includeDeleted)` returns everything a user can see (`internal/sync/service.go:670`). `user_prefs` (`week_start`) is a materialized row the server can read the same way. The jobs leader runs background loops (`cmd/opentodo/main.go:195-227`); `time/tzdata` is embedded (`main.go:29`).
- **Mail transport** comes from `outgoing-email` (`internal/mail`: `Service.Enabled()`, `Build` with the `carriesContent` refusal for encrypted accounts, `Send` with stages, limits, `email.sent` / `email.failed`).
- **Keyboard chords** are declared in the shortcut registry (`web/src/lib/shortcuts.ts`, `go.*` entries in the `go` section) and bound to handlers by id in `Shell.tsx`'s `global` scope; `g Shift+I` (`go.import`) is the precedent for a capital-letter chord. `display-mode` edits the same files in parallel, so this change adds its entries as one block each and nothing else there.

## Goals / Non-Goals

**Goals:**
- One pure module of definitions (`lib/stats.ts`) that the screen, the review steps and (through a fixture) the server digest all use.
- No new server state for statistics or the review beyond one additive personal entity.
- Screens that are lazy-loaded so a user who never opens them pays nothing.
- A digest that is a thin consumer of `outgoing-email`, adding a settings table, a scheduler and one message kind.

**Non-Goals:**
- Server-side statistics or an API for them.
- Persisting computed numbers anywhere.
- Charts beyond bars: no library, no interactivity beyond focus and tooltips as text.

## Decisions

### D1. Definitions in one pure module, local day arithmetic

`web/src/lib/stats.ts` exports `periodFor(kind, today, weekStart)` and `compute(input, period)` returning `{completed, created, late, slipped, overdue, perDay, perWeek, perWeekday, perProject, lateTasks, slippedTasks, overdueTasks}`. Rules:
- a task counts only when it is live (`deleted_at` null and its project not in the Trash) and is not a skipped habit occurrence (`skipped: true`, `habits` D2): skipped records are excluded from every number;
- **whose task it is** (`mine`): outside shared projects every row is the user's. In a shared project a completed row with `completed_by` set counts for that account only; otherwise (open rows, and completed rows with `completed_by` null: completed before the field existed, or ticked on a public link) the assignee rule applies: unassigned or assigned to the user;
- completed: `completed_at` on a day of the period; created: `created_at` on a day of the period, occurrence records (`series_id` set) excluded because completing a recurring task is not creating one; late: counted as completed and its local completion day is after `due.date`; slipped: `due.date` in the period and before today, and not completed by the period's last day (open, or completed on a later day);
- overdue: open, `due.date < today`, not in an archived project (as every cross-project list);
- days are local days: `due` is a floating date compared as stored, instants (`completed_at`, `created_at`) are converted with a `dayOf` function (the device's zone on the device, the stored digest zone on the server).

Periods reuse the filter grammar's period resolution: `this week` and `last week` are `resolveRange({type:'period', unit:'week', offset: 0 | -1}, today, weekStart)` from `lib/filter`, so the Statistics screen, a `completed = last week` filter and the digest agree on week boundaries; 4 and 12 weeks extend the current week back by 3 and 11 weeks. Week start comes from the `date-time-preferences` snapshot. Computation is O(n) over `db.tasks` with `useLiveQuery`, so edits made inside the Review re-render the steps.

- **Alternative: materialize daily counters in a Dexie table.** Rejected: a cache that can drift from the rows for a computation that takes milliseconds on tens of thousands of rows.
- **Alternative: count completions by author from the server history.** Rejected: online only, one request per task, and the op log is purged with the Trash.

### D2. Charts as inline SVG with a table alternative

`StatsView` renders bars with plain `<svg>` (a `Bars` component: labelled axes, one `<rect>` per value, `role="img"` with an `aria-label` summary, and a visually hidden `<table>` with the same values after it). Colours come from the design tokens in `web/src/index.css` (`--accent` for bars, `--faint` for the axis), so light and dark follow the theme; values are also printed above bars, so colour never carries meaning alone. No dependency: a chart library would be the largest addition in the bundle for three bar charts.

### D3. The review is a view over `lib/stats.ts` and the existing rows

`web/src/lib/review.ts` derives the four steps from the same inputs: `inbox` (open, `project_id` null), `overdue` (from D1), `nextActions` (projects: live, `archived` false, where the user may add tasks per `lib/sharing.ts` `canEditTasks` (so a viewer's shared project is never listed), with no open live task; "Archive" is offered only where `canEditProject` allows it), `ahead` (open, due within seven days). `ReviewView` uses the `Tabs` primitive from `web/src/ui` for the steps and the ordinary task list rows (the same component as Today, so `j`/`k`, `c`, `1`–`4`, Delete and the due field work) for the task lists; project rows get two actions. "Add a next action" opens quick add with the project pre-selected (the existing project-scoped quick add) and "Archive" calls `archiveProject` from `lib/archive.ts`. The sidebar entry sits under Completed with the "last review" relative time from `formatInstant` and a `Badge` when due. The screen opens on the first unfinished step.

- **Alternative: a template project plus a saved view, as the website guide does today.** Rejected: that is the workaround the change replaces; it cannot show "projects without a next action".
- **Alternative: manual tick boxes per step.** Rejected in favour of computed done states; the only manual action is "Finish review".

### D4. `review` entity for the finish time

New personal entity `review` with one `kNumber` field `completed_at` (Unix ms, like `project_prefs.feed_seen_at`), entity id `"me"`, in `internal/sync/ops.go` `Schema`. The default branch of the scope resolver places it in the author's personal scope, so the server needs only the schema entry. Client: `Review` type in `lib/types.ts`, defaults in `lib/ops.ts`, Dexie table `review: 'id'` in the next free version (every store redeclared, as the existing versions do), entity maps in `lib/e2eeSync.ts` and `lib/assistant.ts`, the JSON export (a `review` array beside the `Plural` collections, restored on import of an own export, as `user_prefs`), `docs/sync.md`, and an op in the activity fixture that must produce no event. Not content: stays out of `e2ee.ContentFields` and `CONTENT_FIELDS`. Not in `opsync.Plural`: no REST collection.

- **Alternative: a field on `user_prefs`.** Rejected: that spec defines `user_prefs` as three date and time preferences; a review marker there would need a delta on an unrelated capability.
- **Alternative: per-device `meta`.** Rejected: "last review" is a fact about the person; the phone must not say a review is due after the laptop finished one.

**Data model impact:** one additive entity; no existing field changes. The server can read the materialized row (`sync.Get(user, "review", "me")`) for the digest.

### D5. Digest settings as server data with a small table

Migration (next free number) `email_digests(user_id PRIMARY KEY REFERENCES users ON DELETE CASCADE, enabled, weekday, hour, time_zone, lang, created_at, updated_at, last_sent_for TEXT, last_outcome TEXT, last_attempt_at)`. `internal/digest.Store` with `Get`, `Put` (validates `time.LoadLocation`, `hour`, `weekday`, `lang` against `mail.Languages`), `Disable(userID)` called from the encryption key `PUT` handler when encryption turns on. Routes `GET` / `PUT /api/v1/me/email-digest` in `internal/httpapi/digest.go` behind `requireAuth` plus `requireSessionOrFull` (sessions and full tokens; read and agent tokens are refused on the read too), answering `available: false` / 404 `smtp_disabled` when `mailEnabled` is false (no mailer, as on a demo, or no configuration), 409 `encryption_enabled` from `e2ee.Store.Enabled`. The `PUT` is also on the demo deny list (`internal/httpapi/demo.go`, "Email digest"), so a demo refuses it with 403 `demo_restricted` before the handler runs; its `GET` still answers `available: false`. The response carries `nextSendAt` computed from the settings.

- **Alternative: an op-log entity like `review`.** Rejected: the schedule is server configuration that the server acts on, with server-only state (`last_sent_for`), and it must be refused for encrypted accounts at write time, which a sync op cannot do cleanly. Push subscriptions and the email inbox follow the same REST pattern.

### D6. Scheduler: a 5-minute pass on the jobs leader

`digest.Scheduler.Run(ctx)` ticks every 5 minutes (one goroutine, under `runJobsWhenLeader`). A pass selects enabled rows, computes for each the local time in `time_zone`, and sends when `weekday` matches, local time is at or after `hour:00`, before `hour+6:00`, and `last_sent_for` is not today's local date. Before sending it writes `last_attempt_at`; after success `last_sent_for = date, last_outcome = sent`; on failure `last_outcome = <stage>` and the row is retried at a later pass, at most every 15 minutes (so retries stay under the per-recipient limit of five an hour), until the six-hour window closes, then `email.failed` is recorded once more with reason `skipped` and `last_sent_for` is set so the day is not retried. An account with encryption on is refused before anything is built: `email.failed` with `encrypted_account` and the digest is turned off. Restart safety comes from `last_sent_for`. Digest sends are exempt from the server-wide transactional window of `outgoing-email` D7 (they are paced) but not from the per-recipient limit.

Content: `digest.Build(ctx, user)` reads `sync.List(user, "task")`, `"project"`, the membership roles (`sync.SharedProjects`), `user_prefs.week_start` and `review.completed_at` with `sync.Get`, applies the Go port of D1 (`internal/digest/stats.go`, including the `completed_by` rule and the exclusion of skipped occurrences) for the last full week in the user's zone, and sends the `digest` kind through `mail.Service.Send` with `carriesContent[KindDigest] = true`, so an encrypted account is refused with `encrypted_account` even if a row slipped through. A `week_start` of `system` has no browser to ask on the server and reads as Monday; the digest names the week it covers. Titles come from the materialized rows; ciphertext never reaches a template because the refusal happens first. The shared fixture `internal/digest/testdata/stats_fixture.json` (tasks, projects, memberships, `me`, `today`, `weekStart`, expected counts) is read by `stats_test.go` and `web/src/lib/stats.test.ts`.

- **Alternative: compute on the device and have it send the numbers.** Rejected: a device may be off at 07:00 on Friday, and "nothing sent to the server" is a promise about statistics, not about mail the user asked the server to send.

### D7. Templates, language and dates in the digest

The `digest` kind joins `internal/mail/templates` in the six languages. The language is the stored `lang`, captured by the settings card from `navigator.language` (first supported primary subtag, else `en`), shown next to the switch so the user sees it; `app-localization` replaces the capture with the synced preference. Dates in the body are written as weekday, day and month in that language ("Fri 23 Oct", "Fr. 23. Okt.") to stay unambiguous without the user's numeric date format.

### D8. Client wiring

- `router.ts`: `/stats` and `/review`; the shortcut registry (`lib/shortcuts.ts`): `go.review` (`g r`) and `go.stats` (`g Shift+S`) in the `go` section, bound in `Shell.tsx`'s global scope next to the other `go.*` handlers; the cheat sheet and `docs/keyboard.md` are generated from the registry.
- `StatsView` and `ReviewView` are `React.lazy` chunks like `AssistantSettingsSection` (`SettingsView.tsx:229`), with a `Suspense` fallback.
- `NotificationsSettings` gets a `DigestCard` (state-first, weekday and hour selects opened from "Change", zone and language shown, outcomes from the server, offline and unavailable states, help id `settings/email-digest`).
- Help ids `review` and `stats` for the screens; the user guide page `docs/review-and-statistics.md` with `specs: [statistics, weekly-review, email-digest]` and `screens:` entries so the docs check covers the new capabilities.

## Risks / Trade-offs

- **[Older rows do not say who completed a task in a shared project]** → `completed_by` decides when set; rows without it (completed before `completed-date-filters`, public-link ticks) fall back to the assignee rule (D1), documented; the digest uses the same rule, pinned by the fixture.
- **[Large accounts]** → O(n) over tasks with `useLiveQuery`; measured target under 50 ms for 20,000 rows. If needed the computation moves to a `useMemo` keyed on a cheap `db.tasks` revision counter.
- **[Week boundaries differ between device and server]** → Both read the same `week_start` (`user_prefs`) and the server uses the stored `time_zone`; the fixture pins the arithmetic; the digest says which week it covers.
- **[Digest reveals titles to the mailbox]** → Opt-in, plain language in the card ("the message contains task titles"), never for encrypted accounts, and the transport's audit records the send without content.
- **[`g S` is a two-key chord with Shift]** → Same precedent as `g I`; the shortcut list and `?` help document it.
- **[Size]** → No dependency. Lazy chunk about 25 kB minified for the two screens; main bundle +3 kB; Go about 600 lines plus templates; one ticker goroutine on the leader; no measurable memory change.

## Migration Plan

Additive only: the `review` entity (empty until a review is finished; an older server rejects its ops as unknown, as every new entity) and the `email_digests` table (no rows until a user opts in). Rollback is the previous binary: old clients ignore the `review` table and the server rejects new `review` ops while existing rows stay inert; `email_digests` is unread.

## Open Questions

- Whether the Review should offer a fifth "Someday" step once `someday-and-evening` ships (review the parked list). It would be an added step with its own done condition and does not change these specs.
