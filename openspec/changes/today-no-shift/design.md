# Design

## Context

A list page is drawn by `TaskListView` once `useListReady` says so: the tasks are read, and on a project its row and membership. Until then it shows an empty `data-list-loading` frame. The briefing of Today and Upcoming was worded inside the header (`ListHeader` → `useBriefing`), which mounts only after that gate, from the tasks, the review row, the preferences and `useNotifications()`: a `useLiveQuery` that answers `[]` until its read returns.

What was measured (Chromium with touch, the audit's seeded account, a script that records every `layout-shift` entry with its sources and the page's outline at each frame):

| Today, cold load | 360 px | 390 px | 768 px |
| --- | --- | --- | --- |
| before | 0.150 to 0.157 | 0.150 to 0.154 | 0.125 to 0.198 |
| after | 0 to 0.003 | 0 to 0.002 | 0.004 to 0.083 |

- **The one shift on a phone** is the briefing: first "One thing matters today. Water the plants is 2 days late.", then, 100 ms later, "Two things matter today. … and 2 replies are waiting." One more line (20 px; 44 px at 768 px, where the line with the "2 replies are waiting" button is taller), and the quick add and every group move down by it. The notifications' read starts when the header mounts, after the rows are drawn.
- **A second cause in the audit only.** Each browser context of the tour is a device that never synced. The tour opened the Inbox, waited for the first row and went on to Today, which is the first capture: the first sync had not ended, so the notifications arrived from the server about a second after Today was drawn. With that removed (D3) the tour still fails on main (0.153 at 360 px, 0.183 at 768 px) and passes with this change.
- **What is left at 768 px** is inside the rows, not above the list (see Open questions).
- A navigation inside the app (Inbox → Today) never had a late shift: the reads are warm. Its one entry is the frame that replaces one screen with the other (0.051 at 360 px, 0.003 at 768 px), unchanged.

## Goals / Non-Goals

**Goals:** nothing above Today's list changes size after the list is drawn; the first row is not noticeably later; the audit's M12 passes on Today and stays the regression check.

**Non-Goals:** reserving room for a sentence whose length is not known; holding the page for the network; the rows' own late parts; other screens.

## Decisions

### D1. The briefing joins the list's gate

`useBriefing` answers `undefined` until the tasks, the notifications (`useNotificationsRead`, the same query without the `[]` stand-in), the review row and the preferences are read; `null` still means "no briefing here". `useListReady` (moved to `task-list/useListReady.ts`) calls it before the gate, treats `undefined` on a day page as not ready, and hands the briefing to the header. Hidden briefing: the preference is one of the reads, so the page is not drawn before it is known.

All four reads are local and start in the same render as the tasks' read, so they are underway while the tasks are read instead of starting after the first paint.

Alternative: reserve the briefing's room (a fixed number of lines). Rejected: the sentence has one to three lines, so the room would be wrong or wasted, and the interface budget counts chrome above the first row.

Alternative: keep the first sentence for the visit and never update it. Rejected: the briefing follows what the user does (a completed late task leaves the sentence), and the spec says so.

### D2. What the gate costs

Measured with marks inside the page, the gate off and on in turn, cold load of Today:

| | tasks read → list ready (median) | tasks read → last of the briefing's reads |
| --- | --- | --- |
| 360 px, 20 loads each | 34.5 ms → 43 ms | 14 ms (8 to 26) |
| 768 px, 10 loads each | 41 ms → 49 ms | 15 ms (8 to 37) |

So the first row is about one frame later, under 10 ms at the median. From navigation to `ot:list-ready` the medians were 528 → 486 ms at 360 px and 596 → 490 ms at 768 px: the difference is below the run-to-run spread (300 to 900 ms on this machine).

The performance budgets hold: `cold-start` on the 10,000-task account (`scripts/perf/run.mjs`, three runs each, twice) measured 1,152 and 788 ms before and 812 and 697 ms after on the desktop profile (limit 1,200), and 2,097 and 2,155 ms before and 2,035 and 2,071 ms after in the phone profile (limit 3,000). The notifications' read is 50 rows by an index; the tasks table is still read once.

### D3. The audit measures a synced device

`tour.mjs` waits for `ot:sync-idle` on the Inbox it opens first in each browser context. M12 is "from navigation to idle" of a screen; on a device in the middle of its first sync it measured the sync. This does not relax the rule: with the wait, main still fails on Today at both widths.

A reply that a later sync brings while Today is open still lengthens the sentence. That is new information arriving, like a task that a sync adds to the list, and it is not what this change removes.

### Data model, size

No data model impact: no field, op, route or setting. No dependency. The first load changes by a few hundred bytes (one hook moved, one added); the bundle budget is untouched.

### Interface budget

Nothing is added to a screen: still two rows of chrome above Today's first item on a phone (the bar and the quick add), the same task properties, destinations and scroll regions, no shortcut.

## Risks / Trade-offs

- A day page now waits for four local reads instead of one. If the notifications table could not be read, the page would stay empty; the same is already true of the tasks, and the cached list is 50 rows.
- `useBriefing` has a third answer. Its other caller, the Daily check, shows the sentence only when there is one, so it is unchanged apart from never showing a partial one.

## Open questions

- **Rows at 768 px.** After this change Today's cold load still measures 0.004 to 0.083 at 768 px (median 0.02 over 13 loads), all of it inside the list: rows are sometimes painted once at their estimated height before their real one (`row-offscreen`, `content-visibility: auto`), and the counts of comments and attachments and a slot's time are read after the rows mount, which can wrap a title onto a second line (20 px). A project's cold load has the same parts (0.03 to 0.076 at 360 px, 0.008 to 0.021 at 768 px). At 1280 px with a mouse, where the briefing fits one line and this change moves nothing, Today measures 0.036 on most cold loads and about 0.116 on one in ten, on main and with this change alike, for the same reason. Mostly under the limit, but worth its own change: reading the shared counts before the gate needs a look at the 10,000-task budgets first.
- **The Ask button** joins the header's top row from 768 px when the assistant's status arrives from the server (0.0014, nothing below it moves).
