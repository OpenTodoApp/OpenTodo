# Design

## Context

A task's "when" today has three fields:
- `due`, the floating do-on date;
- `start`, a defer date or `someday`;
- `deadline`.

Placement rules live in `web/src/lib` (Today, Upcoming, Anytime, Someday) and, for the Inbox, in `web/src/lib/inbox.ts` with its Go twin `internal/inbox`. The calendar's planning list (`time-blocking` "Planning list and phone agenda") is the place where undated work is put on days. The Open Loops vocabulary already uses the word **Horizons** for step, project and area (`open-loops` "One method vocabulary"), so this feature is called **time sectors** in the interface and `sector` in data, to avoid two meanings of one word.

Two sibling changes in 0.17, `project-flow-modes` and `today-closed-list`, define which open tasks are *available* (not deferred, not blocked, not waiting behind an earlier task of a Sequential project or section) and how Today's limit and its "Waiting for a slot" drawer work. This change consumes that rule; it doesn't define a second one.

## Decisions

**D1. A new field `sector`, not a new value of `start` or `due`.**
- `task.sector`: `""` (none) or one period string:
  - `YYYY-Www`: an ISO 8601 week, `W01`–`W53`, with `W53` only in years that have one;
  - `YYYY-MM`: `01`–`12`;
  - `YYYY-Qn`: `1`–`4`.

  Years run from 2000 to 2999. Anything else is refused by `Validate` (`invalid op`) and by REST (`400 invalid_input`). A null from REST is stored as `""`.
- Kind `kString`, default `""`, last-writer-wins, plaintext.
- Alternatives considered:
  - **Widening `start` to accept periods.** Rejected: older servers and clients validate `start` strictly and would refuse or drop the value. `start` also means "not before", while a sector means "during".
  - **A fake due date with a flag.** Rejected: that's exactly what the research says turns red and rolls over. Every reader of `due` (CalDAV, calendar sync, reminders, webhooks) would treat it as a date.
  - **A label.** Rejected: it carries no period, so it can't carry over or be named relative to today.

**D2. One "when" at a time, written in one batch.**
- From the app:
  - Choosing a sector writes `sector` and clears `due`, `start` (a date or `someday`) and `evening` in the same batch.
  - Choosing a do-on date, a start date or Someday clears `sector` in the same batch.
  - `deadline`, reminders relative to the deadline, `estimate` and labels are kept.
- Because each batch writes the competing fields together, concurrent offline edits converge to one coherent state. Every field takes the batch with the greater timestamp, so the result is either the dated or the sectored version, never a mix that came from one batch.
- REST, MCP and the CLI write exactly what is sent, as they do for `start` (`mcp-server` "Planning fields in write tools"). A task can therefore hold both a `due` and a `sector`. Placement then follows `due` and the sector is ignored for placement (D4), but it's kept and shown in the panel's When line as "Sector: week 44 (ignored while dated)" with Clear.
- Repeating tasks keep a date. The Sector segment is disabled with "Repeating tasks keep a date", and the palette action skips them, saying how many were skipped.

**D3. Relative names and the viewer's week, as one shared rules module.**
`web/src/lib/sectors.ts` exports `parseSector`, `currentPeriods(localDate, weekStart)`, `relativeName(sector, localDate, weekStart)`, `isCarried(sector, localDate, weekStart)` and `resolvePhrase(word, localDate, weekStart)`. `internal/sector` is its Go twin. Both are pinned by `web/src/lib/sectors.vectors.json` (validity, ISO week edge years 2020/2026/2027, Sunday- and Saturday-start weeks, year and quarter boundaries, carry-over) and run by a vitest and a Go test.
- A viewer's **This week** is the ISO week that contains the Monday falling inside the viewer's current week as set by the first-day-of-week preference (`date-time-preferences`).
  - With Monday weeks that's simply today's ISO week.
  - With Sunday weeks, on Sunday 2026-11-01 "This week" is `2026-W45` (the week of Monday 2 November), not `2026-W44`, which ends that day.
  
  Storing ISO weeks keeps one value for every member of a shared project whatever their week start. Only the label is relative.
- **Next week** is the following ISO week. **This month** and **Next month** are from the local date; **This quarter** and **Next quarter** likewise.
- **Carried over:** a sector is carried when its period ends before the start of the viewer's current period of the same kind. For a week, that's before This week; for a month, before the current month; for a quarter, before the current quarter. Carry-over is computed, never written. The task keeps `2026-W43`, and its chip reads "From week 43" in the faint tone, never the overdue colour.
- Alternative: rewrite past sectors to the current week at midnight. Rejected: it writes ops nobody asked for, multiplied by devices, and contradicts "no change without approval".

**D4. Placement.**

| View | A task with a sector and no `due` |
|---|---|
| Inbox | Not a member: a sector schedules the task (MODIFIED `project-organization`; `internal/inbox` and its vectors gain one case) |
| Today | Absent, unless the deadline rule puts it there (deadline today or earlier), as for Someday and deferred tasks |
| Upcoming | Absent: Upcoming lists days |
| Anytime | Absent (MODIFIED `start-dates` "Anytime view") |
| Someday | Absent: choosing Someday clears the sector |
| Project, label and saved views | Listed normally, with a sector chip in the date slot. The chip replaces the due chip the task can't have, so the property count is unchanged |
| Planning list "Time sectors" | Listed under its group (D5) when available |
| Search and filters | Matched by the sector terms (`filter-queries`) |

A task with both `due` and `sector` is placed by `due` everywhere and shows no sector chip in rows.

**D5. The Time sectors source of the planning list.**
- The planning list's source picker (a Combobox) gains **Time sectors** while the switch is on.
- It shows these groups, in order, each with a count and the sum of known estimates, hiding empty groups:
  1. Carried over
  2. This week
  3. Next week
  4. This month
  5. Next month
  6. This quarter
  7. Next quarter
  8. Later (periods after next quarter, by period then position)
- A week sector inside the current month is in This week or Next week, not in This month: each task appears once, by its own sector kind.
- Rows are the standard planning rows. `s` places a row on a day and dragging onto a column or day sets `due`. Either way, as one batch with D2's clearing, it's one undoable change, and the row leaves the list.
- **Availability** is the shared rule from `project-flow-modes`:
  - the task is open and not deleted;
  - it's not deferred (a start date after today, possible only through other clients);
  - it isn't blocked (`task-dependencies`);
  - it isn't waiting behind an earlier open task of a Sequential project or section.
  
  Unavailable tasks aren't listed. Each group's footer reads "2 waiting", which filters the group to them on activation.
  
  Until `project-flow-modes` ships, the predicate is "open, not deleted, not deferred, not blocked". The module exports one `isAvailable(task, ctx)` used by Next, Today's limit and this list.
- With `today-closed-list` on, the row action "Do today" sets `due` to today. When Today is at its limit, the task goes to "Waiting for a slot" exactly as any other addition to a full Today does. This change adds no second limit.
- Alternative: a separate Sectors destination in the sidebar. Rejected: it adds a primary destination (budget: at most 6) and duplicates the planning list.

**D6. Setting the sector.**
- **When popover:** a third segment, **Sector**, after Do on and Start, shown only while the switch is on or the task already has a sector. It offers quick choices (This week, Next week, This month, Next month, This quarter, Next quarter, each with its period in muted text, such as "Week 45 · 2–8 Nov"), then "Later…", which opens a small period picker (week, month or quarter, then the period), and Clear. The segment is a radio group, keyboard-operable like the others.
- **Command palette:** "Set time sector…" applies to the selection, as one batch per task, and one Undo reverts all of them.
- No new single-key shortcut. The palette and the When popover are keyboard-reachable, so the shortcut registry is unchanged.
- **Viewers** of a shared project see the sector as text.
- **Phone:** the segment is part of the When sheet, and the quick choices wrap on a 360 px screen.

**D7. Progressive disclosure.**
- `user_prefs.time_sectors`: `""` means off, `"on"` means on. An unknown value reads as off and is kept.
- Location: Settings → Account → How you work, a switch under the three choices: "Time sectors: plan tasks into this week, next week or this month without a fake date". Off by default for every choice, including Full Open Loops method.
- Off means:
  - no Sector segment (unless the task has one);
  - no planning-list source, and a remembered source falls back to the Inbox;
  - no quick-add phrases;
  - no review section.
  
  Chips, filters, placement and the API keep working. Data is never hidden.
- Simple-list users see nothing new.

**D8. Quick add.**
- With the switch on, the parser recognises these phrases, each with its bundled equivalent in de, fr, it, es and pt (vocab key `sectorPhrases` in `internal/quickadd/vocab.json`, shared with the web parser):
  - `this week`, `this month`, `this quarter`, `next quarter`;
  - `sometime this week`, `sometime next week`, `sometime this month`, `sometime next month`, `sometime this quarter`, `sometime next quarter`.
- `next week` and `next month` alone keep their existing date meaning (`natural-language-capture` "Date and time phrases"), so no existing line changes meaning. Their `sometime` forms give the sector.
- A sector phrase with a date phrase on the same line: the date wins and the sector phrase stays in the title, as `someday` does.
- The parse option `sectors` is passed by the web app from the preference. On the server, `ot add` and `POST /api/v1/quick-add/parse` read the user's materialized `time_sectors`. Vectors pin both the on and off cases.
- Alternative: always recognise the phrases. Rejected: it changes titles for Simple-list users who type "this week" literally.

**D9. Interop.**
- **REST:** `sector` on task representations and writes. There's no new route, so the route matrix is unchanged.
- **Export:** the field is included, as every task field is.
- **CalDAV:** `X-OPENTODO-SECTOR:2026-W44` is served when set and omitted otherwise. A PUT with a valid value sets it; an invalid value is kept in `ical_extra` and ignored, like `X-OPENTODO-START`. Clients that never send it don't clear it. A VTODO with a DUE from a client sets `due` only (D2's "exactly what is sent").
- **Vault:** `[sector:: 2026-W44]` after `[evening:: true]` in the written order. A bad value is reported for the line and leaves the field unchanged.
- **MCP:** `create_tasks` and `update_tasks` accept `sector` (an absolute period or null), and the results carry it. `list_tasks` gains a `sector` filter (an absolute period, or `carried`). Relative words aren't accepted, because a tool call has no viewer date. The error is `-32602` naming the field.
- **CLI:**
  - `--sector` on `ot add` and `ot edit` accepts `this-week`, `next-week`, `this-month`, `next-month`, `this-quarter`, `next-quarter` (resolved on the client with the profile's week start, Monday by default) or an absolute period, and `none` clears it.
  - `ot list --sector <same>` filters.
  - The table appends the relative name in the DUE cell, and `--json` carries `sector`.
- **Activity:** a sector change is shown like a start change ("set the time sector to week 45"). `internal/activity` and `web/src/lib/activity.ts` gain the case in their shared fixture.
- **Webhooks:** the task payload carries `sector`. There's no new event.

**D10. Interface budget** (`docs/interface-guide.md`).
- **Chrome:** no new row above any list. The planning list's picker already exists.
- **Properties:** the sector chip takes the date slot, which a sectored task leaves empty, so the default stays at most 7.
- **Sidebar:** no new destination, so at most 6 primary destinations.
- **Scroll regions:** the planning list is already one region, and its groups scroll inside it, so at most 3.
- **Shortcuts:** none added.
- **Phone:** the planning list doesn't open by itself on a phone (existing rule). The sector segment is in the When sheet.

## Data model impact

| Entity | Field | Kind | Default | Content (E2EE) |
|---|---|---|---|---|
| task | `sector` | string, validated period | `""` | no |
| user_prefs | `time_sectors` | string | `""` | no |

Both are additive and never renamed. They're in the JSON export and the REST representation.

## Risks and trade-offs

- **Week numbers are unfamiliar** to some people. The interface leads with relative names and shows ISO numbers only for later periods, with the dates beside them.
- **Due and sector both set via the API.** That's a coherent but surprising state. D2 shows it explicitly and offers Clear.
- **Size:** about 4 KB gzip. The rules module is small and shared by the planning list and the chips. No dependency, and no measurable effect on image size or runtime memory.

## Open questions

- Should the weekly review offer to carry *every* carried-over task to This week in one action? Proposed: no. One key per task keeps the decision deliberate, which is the point of the review.
