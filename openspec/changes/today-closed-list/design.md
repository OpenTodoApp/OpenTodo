# Design

## Context

Today is built by `todayList` and `groupToday` in `web/src/lib/dayLists.ts` and turned into headed groups by `flatGroups` in `web/src/lib/listGroups.ts`: Earlier, Today, This Evening, then a folded Blocked group (`BLOCKED_OPEN_KEY`, open state per device). The Daily check stores today's focus (`review.focus_date`, `review.focus`, up to three ids) on the personal `review` row; preferences live on the personal `user_prefs` row ("me"). Completions carry `completed_at` and `completed_by`; the logbook groups them by the logical day (`date-time-preferences` "Logical today"). The parallel change `project-flow-modes` defines when a task is *available* (not blocked and not waiting behind an earlier task of a Sequential project or section) in Go and TypeScript.

## Goals / Non-Goals

**Goals:** a cap that is calm (never refuses work, never hides it), deterministic on every device without writes, and the same answer in the web app, the CLI and MCP.

**Non-Goals:** auto-planning, moving tasks to other days, nudges or notifications about the limit.

## Decisions

### D1: The limit is presentation, not a property of tasks

Slots are derived on the device from local rows every time Today renders: no write when the day starts, when a task is completed or when a slot frees up. Alternatives: (a) materialise the day's slot set on the `review` row at the first open of the day: deterministic too, but it writes on view, races between two devices opening Today, and goes stale when tasks are rescheduled elsewhere; (b) a task field "in today's slots": touches shared tasks for a personal choice and leaks into shared projects. Rejected both.

### D2: First come, first served fill order

The slots are filled from Today's available tasks in this order: (1) today's focus (Daily check), (2) the tasks the user let in with Take a slot, in the order taken, (3) Earlier tasks, oldest due first, (4) the remaining tasks by `created_at`, oldest first, ties by id. Within the slots the rows keep Today's usual order and groups (Earlier, Today, This Evening, day parts when `day-parts` is on); the Waiting group is in fill order so its first row is the next to come in.

Ordering the free part by `created_at` rather than Today's due-then-priority order means a task captured during a full day never pushes out a task already planned, and raising a priority never reshuffles the slots. That is Burkeman's rule: new work joins the open list. Alternative considered: Today's display order (due, then priority); rejected because every new P1 or timed task would silently evict another task from view.

Timed tasks get no precedence: a meeting-like task at 14:00 is a calendar commitment and `today-agenda` already shows events; if it should not wait, the user picks it into the focus or takes a slot for it. The Waiting group shows the time on such rows, so it is not missed.

### D3: Take a slot is a personal list of ids for the day

`review.slots_date` (logical date) and `review.slots` (comma-separated task ids), mirroring `focus_date` and `focus`. A list whose date is not the logical today reads as empty without a write. Take a slot appends the id; when every slot is already held by the focus or taken tasks the action is refused with "Today is full: complete a task or give one back" and nothing is written. "Give back the slot" removes the id. Completed, deleted, rescheduled-away or no-longer-available ids drop out as shown, without a write. The list holds at most 20 ids (the maximum limit); the client trims older entries beyond that when it writes. LWW on the whole string: two devices taking different tasks offline converge on the later list (the earlier choice is lost, as for the focus); acceptable for a personal daily choice.

### D4: What counts

A slot holds one open task of Today that is available (`project-flow-modes`), including subtasks listed in Today and tasks of shared projects. Blocked tasks keep the Blocked group and never count. Habits never take a slot: they are routines, listed in their usual place, and saying "5 slots" while a morning habit takes one would make the limit read wrong. Tasks assigned to someone else are not in the viewer's Today today, so nothing changes for them. Until `project-flow-modes` ships, "available" means "not blocked".

### D5: Where the settings live (progressive disclosure)

`user_prefs.today_limit` is a number, 0 = off; clients read a non-integer or a value outside 1–20 as off and keep the stored value. `user_prefs.today_done` is `shown` / `hidden`; empty reads as `shown` in the modes `companion` and `first` and `hidden` in `lists`. Both are in Settings → Preferences → a "Today" card (with the existing Today agenda switch) for everyone, and in Today's overflow menu ("Limit Today…", "Show done today") only in `companion`/`first` mode or once a limit is set. A Simple-list user who never opens that card sees nothing new.

### D6: Done today and Log a win

Done today lists tasks whose `completed_at` falls in the logical today and that the viewer can see in Today's scope (the account's own tasks and tasks of projects they can read), newest first, rendered folded with its count; its open state is per device (`today:done:open`). Completed recurring occurrences are listed (the record, as in Completed). The group never counts toward slots.

Log a win creates the task with `completed_at` = now and `completed_by` = the user in the creating batch, through `mutate()` like any create. Quick add gains a "Log as done" switch (not a new token, so titles are never rewritten): it is shown only inside the Done today group's add row and the "Log a win" palette command, which open quick add with the switch on. Recurrence and reminder tokens are refused with an explanatory chip (a win does not repeat); a date token sets the due date for the record and is shown as such; the default project is the Inbox or the current project. Projects the user can only view are not offered. Automation rules see an ordinary completion, so an on-complete rule fires as it would for a ticked task; webhooks send `task.created` then `task.completed`. A logged win counts in statistics, Close the day's "How the day went" and the digest like any completion.

### D7: Go twin for CLI and MCP

`internal/closedlist.Fill(tasks, prefs, review, today, available)` returns the slot ids and the waiting ids in order; `web/src/lib/closedList.ts` is its twin, pinned by `web/src/lib/closedList.vectors.json` read by both test suites. `today_summary` and `ot today` call it with the server's materialised rows and the user's `user_prefs` and `review` rows. The availability predicate is passed in (from `project-flow-modes`'s Go and TS twins), so this package does not duplicate it.

## Interface budget

No chrome row: the limit shows in the existing lead line ("3 of 5 · 4 done"). No task property. No sidebar destination. Waiting and Done today are list groups inside Today's one list scroll region, folded by default like Blocked. No new shortcut: the palette commands "Take a slot", "Give back the slot", "Log a win" and "Limit Today…" are registered in the registry without keys. On a phone the groups are the same; Take a slot is in the row's long-press menu and the swipe actions are unchanged.

## Data model, size

Additive fields only: `user_prefs.today_limit` (kNumber, default 0), `user_prefs.today_done` (kString, default ""), `review.slots_date` (kString, default ""), `review.slots` (kString, default ""). None is content (ids, dates, numbers), so `internal/e2ee.ContentFields` and `CONTENT_FIELDS` are unchanged. No dependency; no effect on image size or memory.

## Risks / Trade-offs

- [The user does not understand why a task is missing] → Waiting is always listed (folded with a count, "Waiting for a slot · 6"), the lead line names the limit, and the Waiting heading has a one-line hint "Today holds 5. The next one comes in when you finish one."
- [Fill order by creation surprises users who expect priority] → Documented in docs/today-and-upcoming.md; Take a slot and the focus are the explicit overrides.
- [`project-flow-modes` slips] → The predicate falls back to "not blocked"; the vectors include both.
- [Concurrent Take a slot on two devices loses one] → Same LWW as the focus; the lost task is simply still waiting, nothing is hidden.

## Migration Plan

Additive fields; old clients ignore them and keep showing an open Today. Rollback: turning the limit off restores Today exactly. No server migration (fields live in the op log and materialised JSON).

## Open Questions

- Should the Android Today widget honour the limit later? Deferred; it keeps listing all of Today.
