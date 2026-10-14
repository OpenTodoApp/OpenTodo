# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Visibility is decided per view from one date.** `TaskListView.tsx:116-134` builds each built-in view's task set with inline predicates on `due` and `completed_at`; `Sidebar.tsx:55-64` repeats the Today predicate for the count and counts every open task for Inbox and projects (`openCountsByProject`). The grouping in `:219-247` knows Today (Overdue, Today), Upcoming (by date) and label/assigned (by project). `deadlines` extracts these predicates into `lib/views.ts` (`inToday`, `inUpcoming`), which this change extends.
- **Additive fields follow one pattern.** `Schema` kinds in `internal/sync/ops.go:135-179`, `TASK_DEFAULTS` in `web/src/lib/ops.ts:60-64`, `COPY_FIELDS` (`:582`, what completion records and detached copies carry), `history.ts:48`, the own-export importer's "every schema field" path, and the docs tables. `notes_doc` set the precedent that a field without an index needs no Dexie version.
- **Clearing the due date ends a recurrence** (`ops.ts:642-646`): `updateTask` adds `recurrence: null` to the patch in the same batch. Parking reuses that path.
- **Quick add already has `tonight`** as a day word meaning today (`web/src/lib/nlp/vocab/en.ts:7`), and the view supplies defaults the line does not set (`TaskListView.tsx:376-380`, `taskDefaults`).
- **CalDAV keeps unknown X- properties** in `ical_extra` (`internal/caldav/vtodo.go:319-397`, the `extra` slice) and serves them back; `deadlines` takes `DTSTART` for the planned day, so no standard property is left for a deferral. iCalendar has none: RFC 5545 has no "hide until" concept.
- **Sidebar views are a fixed list** (`Sidebar.tsx:200-209`) over `router.ts` routes; `g` key chords are dispatched in `Shell.tsx:108` and listed in `lib/shortcuts.ts:58-66`. Free single keys in lists include `n`, `Shift+N` and `Shift+E`; `o` is taken by Vim mode and dashboards, `m` moves projects, `d` goes to `deadlines`.
- **Things' model.** A to-do's `start` is 0 (Inbox), 1 (Anytime) or 2 (Someday); `startDate` is the "when" date, which `named-importers` maps to `due`; `startBucket` 1 is This Evening (its design, "Real exports examined").

## Goals / Non-Goals

**Goals:**
- One place (`lib/views.ts`) that defines deferred, parked, started and active, used by every list, count and view, so the states cannot drift between the sidebar and the lists.
- Two fields that converge without a relation the op log cannot enforce: a single `start` value holds "date or Someday", and client-side batches keep `start` and `due` consistent for edits made in the app.
- No server logic beyond validation, the two CalDAV properties and the importer columns.

**Non-Goals:**
- Changing what `due` means, or re-deriving Today from a start date for dated tasks (a dated task's day is its due date; a start date only hides it before then).
- A per-person Someday on shared tasks (see proposal, out of scope).
- Time-of-day rules for evening.

## Decisions

### D1. One `start` field: null, a date, or `someday`

`task.start` gets a new kind `kStart` (`null`, the string `someday`, or a date accepted by `isDate`). Holding the date and the Someday state in one field means last-writer-wins can never leave a task both deferred and parked after concurrent edits (spec "Concurrent date and Someday converge"), and a client reads one value to classify the task. `evening` is a plain `kBool`.

- **Alternative: `someday: boolean` plus `start_date`.** Rejected. Two fields written by two devices can end up both set, and every reader would need a precedence rule that the spec would then have to state.
- **Alternative: a `when` enumeration with the due date folded in (Things' model literally).** Rejected. `due` exists, is zoned and timed, and is what CalDAV, reminders and recurrence are built on; folding it in would be a breaking change to the op log.

**Data model impact:** two additive fields on `task`, plaintext for encrypted accounts like `due` (scheduling data, not content; `e2ee.ContentFields` and `CONTENT_FIELDS` unchanged). `Task.start?: string | null` and `Task.evening?: boolean` in `types.ts`, read with `?? null` and `?? false`; `TASK_DEFAULTS` gains both; `COPY_FIELDS` gains both so records and copies carry them; `history.ts:48` lists them (`start` formatted as a compact date or "Someday", `evening` as on/off). No Dexie version bump. `internal/activity` and `lib/activity.ts` classify changes as `edited` (default branch, `internal/activity/activity.go:200-208`); fixture ops pin that. Export and `docs/sync.md`, `docs/api.md` rows as for every field.

### D2. State predicates live in `lib/views.ts`

```
isSomeday(t)           start === 'someday'
isDeferred(t, today)   start is a date && start > today
isStarted(t, today)    start is a date && start <= today
isActive(t, today)     !isSomeday && !isDeferred
inToday(t, today)      !completed && (dueLocal <= today || deadline <= today || isStarted) && (!isSomeday || dueLocal <= today || deadline <= today)
inUpcoming(t, today)   !completed && isActive && (dueLocal > today || (!due && deadline > today))
inAnytime(t, today)    !completed && isActive && !due && start === null
openCount(t, today)    !completed && isActive
```

`TaskListView`, `Sidebar` (Today count, Inbox and project counts via `openCountsByProject`, which now takes `today`), the Day view's lane (unchanged: it keeps using `due`) and the Anytime/Someday routes use these. Grouping in Today becomes Overdue, Today, This Evening; project and Inbox views append a Later group (`isDeferred || isSomeday`, chips "Starts 21 Oct" / "Someday"), after sections in a sectioned project and as a plain group otherwise. All of it is a pure function of local rows and `todayISO()`, which the list already depends on, so the start day flips a task's state without a write and offline.

Why a started task stays in Today: the start date is "from this day on"; Things keeps a dated to-do in Today after its day, and a task that disappeared again the next morning would be the one thing deferral is meant to prevent. The "Started 21 Oct" chip makes the reason visible, and `n`/`Shift+N` re-park or re-defer in one key.

- **Alternative: Upcoming lists deferred tasks under their start day.** Rejected. Upcoming is the due-date calendar; a deferred task is by definition one the person asked not to see yet. The project view's Later group and `deferred & start <= 6 days` show them on purpose.
- **Alternative: hide deferred and parked tasks from the Filter view by default.** Rejected. The filter is the explicit tool; `!someday` and `!deferred` are one term, and a hidden default would make saved-view counts disagree with their queries.

### D3. Parking and un-parking are client-side batches

`parkTask(id)` writes `{start: 'someday', due: null, evening: false}` in one batch; `updateTask`'s existing rule adds `recurrence: null` when `due` is cleared, so a parked series ends (spec "Parking ends the series"). `updateTask` with a `due` or a date `start` on a parked task adds `start: null` (or the date) to the same batch. The server does not enforce any of this: a parked task with a due date from REST or CalDAV stays parked (spec "Someday"), except that the hard-date rule of D2 surfaces it in Today when the date has come, so nothing dated is ever lost from view. Relative reminders follow the cleared due as they do today (`reminderFollowUps`).

- **Alternative: keep the due date when parking.** Rejected. Things clears it, and a parked task that silently keeps a date reappears in Today on that date, which is the opposite of parking. The date is in the history and one Restore away.

### D4. Start date must not be after the due date, enforced in the field only

The start date field (the `DateField` from `date-time-preferences`, in the panel and inline after `Shift+N`) refuses a date after the task's due date with an inline message, like an invalid date. The server and the sync path accept any pair, because two devices can create one concurrently; when it happens, the due date wins (D2's hard-date rule), so the task is never hidden past its due day.

### D5. Views and keys

Routes `{view: 'someday'}` and `{view: 'anytime'}` in `router.ts`, sidebar entries after Upcoming with the vendored `archive` and `layers` icons and no count (both lists are by nature unbounded; the Someday count would only measure procrastination), chords `g o` and `g n` in `Shell.tsx` and `lib/shortcuts.ts`. Both render through `TaskListView` grouped by project like the label and assigned views (`:237-244`), with quick add placeholders "Add a someday task…" and "Add a task…"; `taskDefaults` returns `start: 'someday'` for the Someday route and the parser's result overrides it. List keys in `useListKeys.ts`/`listActions.ts`: `n` toggles park, `Shift+N` opens the inline date field, `Shift+E` toggles evening; all three are refused for viewers of a shared project like the other edits. The detail panel's properties card (`task-detail-redesign` owns the layout) gets a **When** row (Anytime / a date / Someday) and an **Evening** switch (the `Switch` primitive).

### D6. Quick add words and the `tonight` change

Each vocabulary gains `somedayWords` and `eveningWords` (en `someday`, `tonight`, `this evening`; de `irgendwann`, `heute abend`; fr `un jour`, `ce soir`; it `prima o poi`, `stasera`; es `algún día`, `esta noche`; pt `algum dia`, `hoje à noite`, accents optional). `tonight` leaves `dayWords` and becomes an evening phrase: due today plus `evening: true`, which is what it meant to the person all along; the one visible change is the moon chip. `someday` is matched only when `matchDateAt` found no date in the line; otherwise it stays in the title (spec "Someday with a date stays literal"). `ParseResult` gains `start: 'someday' | null` and `evening: boolean`, with chips `someday` and `evening`; `createTask` accepts both.

### D7. CalDAV X- properties

Encode adds `X-OPENTODO-START:SOMEDAY` or `X-OPENTODO-START:YYYYMMDD` and `X-OPENTODO-EVENING:TRUE` when set. Decode maps the two names before the generic `extra` fallthrough: a valid value sets the field, an invalid one is left in `extra` (spec "Unknown value preserved"); the property's absence changes nothing, so clients that drop X- properties they do not know (most do not, but Apple Reminders rewrites) leave a parked task parked. `internal/httpapi/caldav_write.go` emits `start` and `evening` ops like the other mapped fields. `docs/caldav.md` lists both.

- **Alternative: map Someday to `STATUS:NEEDS-ACTION` plus a far-future `DTSTART`, or evening to a due time.** Rejected. Both lie to the calendar client, and `DTSTART` is the planned day since `deadlines`.

### D8. Recurrence shifts the start date with the due date

`moveDates` (from `deadlines` D8) also shifts a date `start` by the due delta; `evening` needs no change because the series keeps its row. The record and the copy are built from `copyOf` over `COPY_FIELDS`, so they keep the occurrence's values. The REST completion path mirrors it; a shared vector in `recurrence.vectors.json` pins both. A series cannot be parked from the app (D3 clears the rule), and a parked task that gets a rule through REST keeps `start: someday` untouched, which hides it until un-parked; the API docs say so.

### D9. Importers

`plan.go` row model gains `Start string` (a date or `someday`) and `Evening bool` with the two field ops; `profile_csv.go` recognises `start` and `evening`; a row that is both parked and dated keeps the date with a warning (D3's rule, applied at import); the own-export profile carries both through the schema path. `named-importers` maps Things `start = 2` to `Start = "someday"` and `startBucket = 1` to `Evening = true` in its task 6.1 instead of warning; `startDate` stays `due` as it specifies. Whichever of the two changes archives second reconciles the Things to-do requirement in `data-import` ("Someday and This Evening SHALL be dropped with a warning" is superseded by "Imported start dates, Someday and evening").

## Risks / Trade-offs

- **[A started task sits in Today for weeks]** → The "Started" chip names the date, `n` and `Shift+N` move it on in one key, and `inbox-triage` later offers the same decisions in a flow.
- **[Counts shrink for people who park many tasks]** → Intended: the counts become "what is on", which is what a count on a sidebar is for; the Someday view lists what was parked.
- **[`tonight` now sets the evening flag]** → The due date is unchanged, so no task moves; the only difference is the group inside Today and the chip. Documented in `docs/quick-add.md`.
- **[Clients that strip X- properties]** → Absence never clears a field; only an explicit different value changes it. A client that strips them cannot park or defer, which it could not do before either.
- **[Two grammars for the filter language]** → The shared example file from `deadlines` D4 gains the new terms.
- **[Old server rejects `start` and `evening` ops]** → Same as every additive field: local value kept, invalid-op path, release notes say to upgrade the server first.

**Size:** no dependency. Two vendored icons under 1 KB each and about 3 KB gzipped of web bundle; the Go binary grows by the kind, the CalDAV branch and the importer columns, well under 50 KB; runtime memory unchanged.

## Migration Plan

No data migration. Absent fields read as null and false, so every existing task is active and nothing moves. Rollback is shipping the previous binary: old clients ignore the fields, the old server rejects new `start` and `evening` ops while stored values stay inert in the log; a task parked before the rollback reappears as an ordinary undated task on old clients.
