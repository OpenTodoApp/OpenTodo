# Proposal

## Why

Everything a task can say about *when* is one due date. There is no way to park an idea without a date and keep it out of the way (the GTD someday/maybe list), to hide a task until the day it becomes relevant (renew the passport, but not before March), or to mark that something is for tonight rather than the working day. People use labels and far-future due dates for these, which pollutes Upcoming and the counts, and the Things importer (`named-importers`) has to drop `start` (someday) and `startBucket` (evening) with a warning because the model has no field for them (its design D7). This change adds the three states of Things' "when" model on top of the existing due date: a start date that defers a task, Someday, and This Evening.

## What Changes

- **Two additive task fields.** `start`: null, a floating date `YYYY-MM-DD`, or the word `someday`; `evening`: a boolean (default false). One `start` field holds both the date and the Someday state so the two can never coexist after concurrent edits. Both are ordinary fields: settable offline, last-writer-wins, exported, accepted by the REST collection, plaintext on encrypted accounts like `due`.
- **Deferred tasks.** A task whose start date is after today is *deferred*: it stays out of Today, Upcoming, Anytime and the sidebar counts, and its project or Inbox view lists it in a **Later** group at the end with a "Starts 3 Nov" chip. On its start day it becomes active without any write: it appears in Today, marked as started, and stays there until it is done, rescheduled or deferred again, as a dated to-do does in Things. A hard date wins over deferral: a task due or with a deadline today or earlier is in Today whatever its start.
- **Someday.** `start = someday` parks a task: out of Today, Upcoming, Anytime and the counts, listed in the new **Someday** view (grouped by project, `g` then `o`) and in its project's Later group. Parking clears the due date in the same batch, as Things does; giving a Someday task a due date or a start date un-parks it in the same batch.
- **This Evening.** `evening` groups today's tasks into **This Evening** below the day's tasks in Today, and shows a moon chip on rows elsewhere. It says nothing about time: a task due today at 20:00 is not automatically an evening task.
- **Anytime view** (`g` then `n`): every open task that is neither parked, deferred, dated nor started, grouped by project: what could be done whenever there is time. Together with Someday it gives the two GTD lists the website's guides describe.
- **Keyboard and panel.** `n` parks or un-parks the selected task, `Shift+N` opens an inline date field to defer it, `Shift+E` toggles This Evening; the detail panel gets a **When** row (Anytime, a start date, Someday) and an Evening switch next to Due. The start date uses the same date field and calendar as the due date. A start date after the due date is refused in the field with a message; the server does not enforce the relation.
- **Quick add:** `someday` (and `irgendwann`, `un jour`, `prima o poi`, `algún día`, `algum dia`) parks the new task when the line has no date; `tonight` and `this evening` (and their equivalents) make the task due today *and* for the evening, where `tonight` today only means today. Adding a task in the Someday view parks it.
- **Filters:** `someday`, `deferred` and `evening` keywords, and `start <cmp> <date>` with the date expressions of `due`. Queries keep matching every open task by default; the keywords make the states explicit (`@waiting & !someday`).
- **CalDAV:** `X-OPENTODO-START` (a date or `SOMEDAY`) and `X-OPENTODO-EVENING:TRUE` are served and accepted, and never stored in `ical_extra`. iCalendar has no property for a deferral, and `DTSTART` is taken by `deadlines`.
- **Recurring tasks:** a start date moves with the series by the same number of days as the due date; `evening` stays on the series; the completed record keeps the occurrence's values.
- **Import:** Things `start = 2` becomes Someday and `startBucket = 1` becomes evening instead of warnings; CSV gains `start` (a date or `someday`) and `evening` columns; the own export round-trips both fields.

Out of scope:
- Reminders for a start day ("it's time to look at this again"), a Someday review flow (`inbox-triage` and `stats-and-review` build the review), and a Month or timeline view (`month-and-timeline-views`).
- Per-member Someday or evening state on shared tasks. Both are task fields and therefore shared with the project, like the due date; a personal "later" belongs to a label or a saved view.
- Evening time boundaries, a "This Morning" or any other bucket, and an evening setting for recurring rules.
- The assistant, MCP, agent tokens and the CLI (their task projection and allow-lists are explicit, see the `deadlines` proposal; they learn `start` and `evening` in the same later change). TickTick's `Start Date` column stays as `named-importers` maps it.

Depends on: `deadlines` for the rule that a deadline today or earlier surfaces a deferred or parked task in Today, and for the `d` key it takes (this change uses `n`, `Shift+N` and `Shift+E`).

ROADMAP: advances "Next: Parity and depth" row 2, **Start dates, Someday and This Evening** (`someday-and-evening`). `named-importers` waits for it to map Things' `start` and `startBucket`.

Nothing here is **BREAKING**. The op log gains two additive fields; an older server rejects an op on an unknown field as invalid, as for every additive field before, and an older client stores and forwards the values untouched. No environment variable is added.

## Capabilities

### New Capabilities
- `start-dates`: when a task becomes relevant: the `start` field (a date or Someday) and the `evening` flag, their storage and sync, how deferral and parking hide a task from the planning views and the counts, the Someday and Anytime views, the This Evening group, and how they are set from the panel and the keyboard.

### Modified Capabilities
- `filter-queries`: `someday`, `deferred` and `evening` keywords and the `start` date term.
- `natural-language-capture`: `someday`, `tonight` and `this evening` phrases, and the Someday view as capture context.
- `caldav-sync`: `X-OPENTODO-START` and `X-OPENTODO-EVENING` served and accepted.
- `recurring-tasks`: a start date follows the series; evening stays on it.
- `data-import`: Things Someday and evening, CSV `start` and `evening` columns, own export round trip.

## Impact

- **Op schema:** `task.start` with a new kind `kStart` (null, `"someday"` or a valid `YYYY-MM-DD`, reusing `isDate` from the `kDue` branch, `internal/sync/ops.go:352-362`) and `task.evening: kBool`. `web/src/lib/types.ts`, `TASK_DEFAULTS` in `web/src/lib/ops.ts:60-63` (`start: null`, `evening: false`), `COPY_FIELDS` (`ops.ts:582`), `lib/history.ts:48`, `docs/sync.md` schema table, `docs/api.md` task fields. Not user-written text, so `e2ee.ContentFields` and `CONTENT_FIELDS` are unchanged. No Dexie version bump: old rows read `undefined` as `null` and `false`, the `notes_doc` precedent.
- **Web:** `lib/views.ts` (shared predicates `isDeferred`, `isSomeday`, `isActive`, extended `inToday`), `TaskListView.tsx:122-135` and `:219-250` (selection, Later group, This Evening group), `Sidebar.tsx:55-64` and `:200-209` (counts, two entries), `router.ts` (`someday`, `anytime` routes), `TaskRow.tsx` (chips), the detail panel (When row, Evening switch), `useListKeys.ts`/`listActions.ts`/`lib/shortcuts.ts`, `lib/filter/parse.ts` and `evaluate.ts`, `lib/nlp` vocabularies and `parse.ts`, `lib/recurring.ts:41-43`, `lib/activity.ts` fixture.
- **Server:** `internal/caldav/vtodo.go` encode and decode (two X- properties), `internal/httpapi/caldav_write.go` (field ops), `internal/filter` (query tokens), `internal/httpapi/recurring.go` (start shift), `internal/importer` (`plan.go` row model, `profile_csv.go`, `profile_opentodo.go`), `internal/activity` fixture (an `edited` event). No new route, nothing for the demo deny list.
- **Docs:** `docs/tasks-and-projects.md`, `docs/views.md`, `docs/filters.md`, `docs/quick-add.md`, `docs/keyboard.md`, `docs/recurrence.md`, `docs/caldav.md`, `docs/import.md`, `docs/api.md`, `docs/sync.md`; the help bundle is regenerated.
- **Size:** no new dependency. Two vendored Lucide icons (`archive` for Someday, `layers` for Anytime; `moon` is already in the set) and about 3 KB gzipped of web bundle for the views, predicates, parser words and filter terms. Binary and memory unchanged apart from the embedded bundle.
