# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **One date.** `Task.due` is `{date, time?, tz?}` (`web/src/lib/types.ts:26-37`, `internal/sync/ops.go:352-370` `kDue`). Today and Upcoming select on it alone (`web/src/app/TaskListView.tsx:122-125`), group it (`:219-236`), and the sidebar counts it (`web/src/app/Sidebar.tsx:55-64`). `describeDue` in `web/src/lib/dates.ts:272-281` produces the row label and tone; `TaskRow.tsx:63` renders it.
- **Additive fields have a pattern.** `estimate_minutes`, `recurrence`, `section_id` and `notes_doc` each added a `Schema` entry with a kind (`ops.go:135-179`), a type field, a default in `TASK_DEFAULTS` (`web/src/lib/ops.ts:60-64`), an entry in the history field list (`web/src/lib/history.ts:48`), an export field carried by the own-export importer, and a docs row in `docs/sync.md:42-55` and `docs/api.md`. `notes_doc` showed that a field without an index needs no Dexie version: old rows read `undefined`.
- **Relative reminders follow `due` in the same batch.** `reminderFollowUps` (`ops.ts:378-405`) rewrites `fire_at` of every live `relative` reminder whenever a change sets `task.due`; the server scheduler only compares `fire_at` with the clock. Kinds are validated by `kReminderKind` (`ops.go:73`).
- **CalDAV already speaks both properties.** `Encode` writes `DUE` from `due` and restates it as `DTSTART` on recurring tasks (`internal/caldav/vtodo.go:146-151`); `decode` keeps a client's `DTSTART` in `ical_extra` unless it equals `DUE` on a recurring task (`:384-397`); the time-range filter handles `DTSTART` and `DUE` together (`internal/caldav/filter.go:117-131`).
- **Quick add vocabularies have `before` words.** `en.before = ['on', 'by', 'due']` (`web/src/lib/nlp/vocab/en.ts:29`) are consumed with the date they precede; `matchDateAt` (`nlp/dates.ts:236`) returns the first date phrase; `ParseResult` has one `due` (`nlp/parse.ts:38-48`).
- **Recurrence moves `due` by a pure function.** `moveDue` (`web/src/lib/recurring.ts:41-43`) keeps time and zone and sets the next date; the REST completion path does the same in `internal/httpapi/recurring.go`.
- **Importers.** The generic JSON profile treats `deadline` as a due alias (`internal/importer/profile_json.go:375`), the Todoist JSON profile warns (`:545`); `named-importers` (in flight) keeps a Things deadline as a description line and warns until this change lands (its design D7).

## Goals / Non-Goals

**Goals:**
- One additive date field whose every consumer (rows, Today, Upcoming, filters, reminders, CalDAV, quick add, recurrence, import, history) is specified, so the two dates never collapse into one again.
- Zero server logic beyond validation and the CalDAV mapping; everything else is computed on the device from local data.
- `named-importers` can map deadlines by writing a field instead of a warning, with no change to its approach.

**Non-Goals:**
- A deadline time, zone or reminder-at-time (see proposal, out of scope).
- Changing what `due` means. It stays the planned day; nothing migrates.
- New sort or group options on saved views, and the assistant, MCP, agent-token and CLI surfaces.

## Decisions

### D1. `task.deadline` is a bare `YYYY-MM-DD` string with a new `kDate` kind

The value is `null` or a date string, not a `{date}` object. A string cannot grow a `time` or `tz` by accident, compares as text like every date the filter compiler handles (`lib/filter/evaluate.ts:50-58`), and needs no zone conversion: a deadline is a day everywhere, like a floating due date. The server gains `kDate` in `checkKind`, reusing `isDate` from the `kDue` branch. Per-field last-writer-wins on `(ts, device)` gives convergence; offline edits queue in the outbox like every op.

- **Alternative: reuse the `Due` shape `{date}`.** Rejected. It invites a `time` that this change refuses, and every reader would have to handle the zoned branch for a value that never has one.
- **Alternative: a deadline as a second reminder or a label convention.** Rejected. Not filterable, not importable, not what the comparison pages promise.

**Data model impact:** one additive field, `task.deadline`, plaintext for end-to-end encrypted accounts like `due` (it is scheduling data, not content; `e2ee.ContentFields` and `CONTENT_FIELDS` are unchanged). `Task.deadline?: string | null` in `types.ts` with the `?? null` read rule of `notes_doc`; `TASK_DEFAULTS.deadline = null`; no Dexie version bump (no index: Today, Upcoming and the sidebar already filter the live task set in memory). `history.ts:48` lists the field and formats it with `formatDate(…, 'compact')`. `internal/activity` and `lib/activity.ts` classify a deadline change as `edited` (the default branch at `internal/activity/activity.go:200-208`); a `deadline` op is added to `activity_fixture.json` to pin that on both sides. The own export carries the field through the existing "every schema field" path; `docs/sync.md` and `docs/api.md` get a row. No new field is user-written, so nothing is encrypted.

### D2. Countdown computed in `lib/dates.ts`, tones from the existing scale

`describeDeadline(deadline, today)` returns `{label, tone}` next to `describeDue`: `Nd` for `N` days ahead, `Today` on the day, `Nd over` after it; tone `later` beyond seven days, `soon` within seven, `overdue` on the day and after (reusing `describeDue`'s tone names so `TaskRow` keeps one colour map). The chip carries the vendored Lucide `hourglass` icon via `<Icon>` and a `title` with the full date in the user's format. It is a pure function of two ISO strings, so it recomputes when `todayISO()` changes (the list already re-renders on the day change through its `today` dependency, `TaskListView.tsx:81`).

- **Alternative: words ("3 days left").** Rejected for row width at 360 px; the panel shows the full date and the words in its row.

### D3. Today and Upcoming selection: deadline joins the predicate, due keeps the grouping

`TaskListView.tsx:122-125` becomes:
- Today: `!completed && (localDate(due) <= today || deadline <= today)`; grouping (`:219-225`) puts a task in Overdue when `localDate(due) < today || (deadline < today && localDate(due) !== today)`, else in Today's group. A task qualifies once (one row).
- Upcoming: `!completed && (localDate(due) > today || (!due && deadline > today))`; grouping keys by `localDate(due) ?? deadline`, and within a day tasks with a due date sort first (`compareDueThenPriority`, then deadline-only tasks by deadline, priority).
- `Sidebar.tsx:61` counts with the Today predicate, extracted into `lib/views.ts` as `inToday(task, today)` so the list, the count and the Day view's "unscheduled" lane (unchanged: it keeps using `due`) share one definition.

Why Upcoming lists deadline-only tasks: a task with a Friday deadline and no plan would otherwise be invisible until Friday morning, which is the day it is too late to plan. A task with both dates shows under its due date only, because the row already shows the countdown and a second row would double-count.

- **Alternative (Todoist): Today and Upcoming ignore deadlines, rows show the countdown.** Rejected. It makes the deadline a label, not a date the app acts on; the roadmap row asks for "Today and Upcoming".
- **Alternative: a separate "Deadlines" group in Today.** Rejected. Overdue and Today already carry the urgency; a third group fragments short lists.

### D4. Filter term `deadline` reuses the `date` node

`parse.ts:253` accepts `deadline` alongside `due` and `created` (`field: 'due' | 'created' | 'deadline'`), and `evaluate.ts:137-143` compares `t.deadline ?? null` with `compareISO`, never matching null. `NO_KEYWORDS` (`parse.ts:164`) gains `deadline`. `printDate`/`print` round-trip the new field so saved views keep their text. `docs/filters.md` grammar, term table and error table (`Expected "date", "project", "labels", "time" or "deadline" after "no"`) are updated. The server-side parser that checks view queries on `/api/v1/views` (`internal/filter`) learns the same tokens; a vitest and a Go test share the example queries so the two grammars cannot drift.

### D5. Reminder kind `deadline`, not a flag on relative reminders

`kReminderKind` accepts `deadline`; `offset_minutes` keeps its meaning and bounds; `fire_at` = 09:00 local on the deadline plus offset, computed by `deadlineFireAt(deadline, offset)` beside `relativeFireAt`. `reminderFollowUps` gains a second branch: a change that sets `task.deadline` rewrites `fire_at` of every live `deadline` reminder in the same batch (same HLC timestamp and device as the deadline op, so last-writer-wins picks both from one edit), clearing delivered and dismissed state when the firing moved, as the due branch does. `RemindersField.tsx` offers "On the deadline", "1 day before the deadline" and a custom offset once the task has a deadline. Importers map nothing to this kind.

- **Alternative: an `anchor` field (`due` | `deadline`) on relative reminders.** Rejected. A client that predates the field treats every `relative` reminder as due-anchored and would move a deadline reminder when it reschedules the due date (`ops.ts:396` skips only non-`relative` kinds). A new kind is skipped by old clients, so the reminder keeps its firing time until an updated device touches the deadline.

### D6. CalDAV: `DUE` is the deadline when there is one, `DTSTART` the planned day

Encode (`vtodo.go:146-151`): with a deadline, `DUE;VALUE=DATE:<deadline>` and, when `due` is set, `DTSTART` from `dueProp` (date, floating date-time, or TZID with VTIMEZONE); without a deadline, unchanged (`DUE` = due, `DTSTART` restated only on recurring tasks). Decode (`:319-397`): after collecting `DUE` and `DTSTART`, if both parse and differ, `in.Due` = DTSTART, `in.Deadline` = DUE's date (a timed DUE loses its time; the resource is served back as a DATE, so the client sees the normalisation on its next fetch); if they are equal, `in.Due` = DUE and no deadline; if only `DUE`, as today. The derived-anchor rule for recurring tasks keeps working because "equal" covers it. `DTSTART` is no longer stored in `ical_extra` when it was mapped. The time-range filter needs no change. `docs/caldav.md` "What maps to what" gets the two rows and a note that the deadline has no time.

- **Alternative: keep `DUE` = due and add `X-OPENTODO-DEADLINE`.** Rejected. Calendar clients would show the planned day as the due date and never the deadline, and Tasks.org, Thunderbird and Apple Reminders already send a start date as `DTSTART`, which today lands unread in `ical_extra`.
- **Risk accepted:** a client that only sets `DUE` on a task with a deadline rewrites the deadline, not the due date. That is the iCalendar meaning of `DUE`, and the client shows the deadline as its due date, so the person sees what they edit.

### D7. Quick add: a `deadline` keyword per language, `by` unchanged

Each vocabulary gains `deadlineWords` (en `deadline`; de `frist`, `deadline`; fr `échéance`, `deadline`; it `scadenza`; es `fecha límite`, `plazo`; pt `prazo`), matched as a phrase directly before a date phrase, with accents optional like the other words. `parse` returns `deadline: string | null` and a `deadline` chip; the first deadline phrase wins and a second stays in the title, like a second date. `createTask` accepts `deadline`. `QuickAdd.tsx` shows the chip with the `hourglass` icon.

- **Alternative: `by <date>` sets the deadline.** Rejected. `by` is documented as a due phrase (`docs/quick-add.md`, "Words like on, by and due…") and people type "pay rent by Friday" meaning the day they will do it; silently moving those tasks out of Upcoming would read as data loss. The maintainer can revisit this once the word has been in use.

### D8. Recurrence shifts the deadline by the due delta

`moveDue` becomes `moveDates(series, nextDate)` returning `{due, deadline?}`: when the series has a deadline, `deadline = addDaysISO(deadline, days(nextDate) - days(due.date))`. Completion, skip and detach (`recurring.ts:69-107`) write the shifted deadline on the series and leave the record and the copy with the original one (they are built from `copyOf`, which now includes `deadline`). The REST completion path (`internal/httpapi/recurring.go`) applies the same arithmetic; a shared vector in `recurrence.vectors.json` pins both. Because the delta is a function of the old and new due dates, which every device computes identically, concurrent completions converge.

### D9. Importers write the field; CSV gains a column

`plan.go` row model gains `Deadline string` and emits a `deadline` field op; `profile_csv.go` recognises `deadline` (`YYYY-MM-DD`, else a row error like a bad priority); `profile_json.go:375` stops treating `deadline` as a due alias and reads it into the deadline (a date-time keeps the date with a warning), `:545` maps instead of warning; the own-export profile carries it through the schema path. `named-importers` maps Todoist `DEADLINE` (through its date-language parser) and Things `deadline` to the same row field, so its tasks 3.3 and 6.1 change from "warning" to "field" without touching its approach. Preview totals gain `deadlines` (rows with a deadline) so the import screen can show it.

Archive order: whichever of `named-importers` and this change archives second reconciles the Things to-do requirement in `data-import` (its "dropped with a warning until the data model holds them" sentence is superseded by "Imported deadlines" here).

## Risks / Trade-offs

- **[Today grows for people who import many Todoist deadlines]** → Only deadlines today or earlier qualify, the same set those apps raise; the countdown makes the reason visible, and `deadline <= today` in a saved view isolates them.
- **[A timed `DUE` from a CalDAV client loses its time when a `DTSTART` is present]** → Served back as a DATE at once, so the client shows the normalisation on the next fetch; documented in `docs/caldav.md`. The due time, which is what the person acts on, is kept intact in `DTSTART`.
- **[Two grammars for the filter language (web and `internal/filter`)]** → A shared example file is parsed by both test suites, as the recurrence vectors do for rules.
- **[An old server rejects `deadline` ops]** → The same as every additive field: the client keeps the local value, the rejected op follows the sync protocol's invalid-op path, release notes say to upgrade the server first.
- **[`hourglass` is not in the vendored icon set]** → Vendored from Lucide like the rest (`web/src/ui/icons/lucide.ts`), used on the row and the chip so `usage.test.ts` passes without a reserved entry.

**Size:** no dependency. About 2 KB gzipped of web bundle (countdown, parser words, filter term, CalDAV docs excluded); the Go binary grows by the kind, the CalDAV branch and the importer column, well under 50 KB; runtime memory unchanged.

## Migration Plan

No data migration. Absent deadlines are null and nothing changes for existing tasks; Today, Upcoming and CalDAV output are byte-identical for tasks without a deadline. Rollback is shipping the previous binary: old clients ignore the field, the old server rejects new `deadline` ops and `deadline` reminders while stored values stay inert in the log.
