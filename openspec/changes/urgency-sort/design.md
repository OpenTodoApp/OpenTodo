# Design

## D1. One more `sort_by` value, built on `custom-field-sort`

`view.sort_by`, `project_prefs.sort_by` and the label's `sort_by` are plain strings in `internal/sync/ops.go`; clients read an unknown value as their default and keep it. `custom-field-sort` (PR #549) already widened the client's sort-value type to "a built-in name or `field:<name>`" with one parse and build helper, a comparator that puts tasks without a value last in either direction, and the tie chain due date, priority, position, id. Urgency is one more built-in name, `urgency`, handled by the same helper and comparator: every task has a score, so nothing falls to "without a value", and equal scores use the tie chain.

Alternatives considered:
- A separate `order_mode` field: a new op field for what is one more value of an existing one. Rejected (AGENTS rule 3: additive only when needed).
- Writing the urgency spec as MODIFIED blocks of the four requirements `custom-field-sort` modifies: both changes would carry a copy of the same requirement, and whichever archives second would overwrite the other's wording. Rejected: this change only ADDs requirements, and is implemented after #549 is archived. If #549 stalls, the owner decides whether to finish it first; this change does not fork its helpers.

Data model impact: none. No migration; export unchanged (it already carries `sort_by`).

## D2. The score: fixed weights, two decimals, one function

The score is the sum of the components below, each rounded to two decimals (half away from zero) before summing, so Go and TypeScript agree to the last digit without depending on float summation order. `today` is the viewer's logical today (`date-time-preferences` "Logical today"); a task's due day and deadline are read in the viewer's zone as lists already read them (zoned dues convert).

Proximity ramp `ramp(d)`, where `d` = days from today to the date (negative when past): `1.0` when `d ≤ -7`; `0.2` when `d ≥ 14`; otherwise `0.2 + 0.8 × (14 − d) / 21`. So today is `0.7333…`, tomorrow `0.6952…`, one week ahead `0.4667…`, three days late `0.8476…`.

| Component | Value | Breakdown label |
|---|---|---|
| Due | `12.0 × ramp(due day − today)`; 0 without a due date | "Due today", "Due in 3 d", "3 d earlier" |
| Deadline | `8.0 × ramp(deadline − today)`; 0 without a deadline | "Deadline in 5 d", "Deadline passed" |
| Priority | p1 `6.0`, p2 `3.9`, p3 `1.8`, p4 `0` | "Priority 1" |
| Blocks others | `8.0` when the task is in the `blocked_by` of at least one open, live task known locally | "Blocks 2 tasks" |
| Age | `2.0 × min(age days, 365) / 365`, age from `created_at` to today | "Age 30 d" |
| Running timer | `4.0` while the viewer has a running time entry on the task | "Timer running" |
| Blocked | `−5.0` while the task is blocked (`task-dependencies` "Blocked state is derived") | "Blocked" |
| Deferred | `−3.0` while the start date is after today | "Starts in 4 d" |
| Someday | `−6.0` while parked (start `someday`) | "Someday" |

Example: a p1 task due today, created 30 days ago, blocking two tasks: 8.80 + 6.00 + 8.00 + 0.16 = 22.96.

Weights follow Taskwarrior's defaults where an input exists (due 12, blocking 8, priority 6/3.9/1.8, active 4, age 2, blocked −5, waiting −3), with deadline added at 8 (a hard date should pull, but less than the planned day the person chose) and Someday at −6 (parked tasks sink below anything active). Tags (`+next` 15) have no equivalent: OpenTodo has no reserved label, and a user who wants a "next" boost orders by a custom field.

Alternatives considered:
- Tunable weights in Settings: more explanation, a synced preference per weight, and scores that differ between people sharing a view. Out of scope now; the table is the documentation.
- A custom Number field as a component: a formula field by another name (anti-roadmap "no formulas"). WSJF users already have `custom-field-sort`.
- Floats without rounding: Go and V8 agree on IEEE doubles for the same operations, but the order of additions in two codebases drifts over time. Rounding per component removes the risk and gives the tooltip its numbers.

Recurring tasks use their current occurrence's due date. Subtasks get a score but stay under their parent (the list orders top-level tasks only, as every other order). Completed tasks are not scored; they stay in the Completed group. "Blocks others" counts only tasks known locally, so on a shared project a viewer sees the same blocking as any member holding the same tasks; tasks outside the viewer's scope cannot be seen and do not count (`task-dependencies` already keeps blockers within the sharing scope).

## D3. Shared vectors

`web/src/lib/urgency.vectors.json` holds cases: `{today, zone, task, others, running_timer_task_id, expect: {score, parts: [{key, value}]}}` covering every component, the ramp's two clamps and its interior, zoned dues across midnight, p4 with nothing else (score 0), blocked and blocking at once, a deferred Someday-free task, a deadline only, a completed blocker (does not block), and rounding at `x.xx5`. `urgency.test.ts` and `internal/urgency/urgency_test.go` both run the file, like `recurrence` and `ruleval`. The breakdown keys are stable (`due`, `deadline`, `priority`, `blocks`, `age`, `timer`, `blocked`, `deferred`, `someday`); labels are translated on the client.

## D4. Where the score shows

- **Order by** lists **Urgency** after Title and before the custom fields. Choosing it sets the direction to the most urgent first (stored `asc`, see D6.1); the user may switch it under More options.
- **Score chip:** only while the list is ordered by urgency, each top-level row shows the score with one decimal in `text-faint`, tabular figures, in the row's trailing group (`data-row-trailing`), before the origin. It is a button: hovering shows the breakdown in the design-system Tooltip; focusing it with Tab and pressing Enter opens it as a Popover, Escape closes it. The name is "Urgency 23.0, show why" (the chip shows one decimal, the breakdown two). Subtask rows show no chip.
- **Phone:** the phone row keeps its one cell (interface guide, "On a phone"), so no chip is drawn. Under urgency order the touch row menu adds "Why here?", which opens the breakdown in a bottom sheet.
- The task page and the detail panel do not show the score: it explains an order, so it lives with the order.

Interface budget: no chrome row is added (the choice is inside the display panel); the chip is not a task property (it is an order indicator shown only when asked for, like the time column), so the seven-property limit is unchanged; no sidebar destination; no scroll region; no new shortcut.

Progressive disclosure: nothing changes until someone picks Urgency in Order by. Simple-list users never see it; the defaults stay manual order (projects, labels) and due date (views).

## D5. Server and tools

`internal/urgency` exports `Score(task, ctx) Result` with `ctx` holding today, zone, the set of task ids that are open blockers of open tasks, and the running entry's task id. The MCP `list_tasks` tool gains `sort` (`default` | `urgency`); with `urgency` it orders the page by score (ties as in D1), adds `urgency` (number) and `urgency_parts` (`[{key, value}]`) to each result, and computes `today` from the `timezone` argument (the account's day start applies, as for other tool dates). Cursors stay stable within a sort. The CLI `ot list --sort urgency` sorts what it fetched with the same package and prints the score as a column (and in `--json`). No REST task route sorts server-side today, so REST gets nothing beyond `/api/v1/views` accepting the value.

Encrypted accounts: the score reads no content, so the server-side tools compute it from the same rows on encrypted accounts.

Size: no dependency; image size and memory unchanged within noise.

## D6. Decisions made while implementing

1. **The most urgent first is `asc`.** The proposal stored the default as `desc`. A 1.0 client reads an unknown `sort_by` as its default order but keeps the stored `sort_dir` (`git show v1.0.0:web/src/lib/listDisplay.ts`, `views.ts`): with `desc`, a project ordered by urgency would show its manual order reversed there, and a view its due order reversed. So the urgency order reads like a rank: `asc` (the default) is the most urgent first, `desc` the least urgent first, and the direction select names them **Most urgent first** and **Least urgent first** (the `r` keys' announcement too) instead of Ascending and Descending. A 1.0 client shows the plain default order. `/api/v1/views` accepts both directions as before.
2. **The Inbox offers it too.** The Inbox's Order by is the project list's (`LIST_SORT_OPTIONS`); leaving one page out would need a second list for no gain. Today and Upcoming keep their own orders, as the proposal scoped.
3. **Why here? in the row menu at every width.** On a fine pointer from 768 px the revealed row actions float over the row's end while the pointer is on the row (task-list-width D2), so the score under them cannot be hovered. Moving the score elsewhere would change every row's grid; the quieter fix is the row menu (More, a right-click, `.`, a touch hold): for one task under the urgency order it starts with **Why here?**, which shows the breakdown in the menu (a bottom sheet on a phone). The chip stays where D4 put it, readable at rest; from the keyboard Tab reaches it and the revealed actions give way while it has the focus (the rule the row's facts already use), the tooltip opens on focus and Enter opens the popover. On touch and between 640 and 768 px, where the actions are not drawn, hovering or tapping it works as D4 says. The `list-display-options` delta says so.
4. **Blocked on the client is the list's blocked map.** The web reads the blocked component from the same map the Blocked badge uses (`liveBlocked`, which breaks a cycle that exists for a moment); Go uses `internal/flow`'s rule (any open, live blocker). They differ only while a cycle exists on one device, which the vectors do not contain. "Blocks others" counts open, live tasks naming the task, once each, never itself.
5. **No exact half to round.** The components are 12 and 8 times `0.2 + 0.8k/21` (multiples of 1/7 and 1/21 after the constant) and `2·age/365`; none lands on an exact half at two decimals, and the fixed weights are already round. The vectors cover rounding up (2.86, 6.48, 0.55) and down (8.34, 10.17, 4.34, 0.16) instead, and both sides round with the same IEEE operations (`round(|x|·100)/100` with the sign).
6. **Labels.** "3 d earlier" read oddly; an overdue due date reads **Due 3 d ago**. A deadline in the past reads **Deadline passed**, a start date **Starts in 4 d**. Values use the locale's number format with a sign.
7. **Where the logical today comes from.** The web uses `useToday()` (the day start applies) and the viewer zone; the created day of the age term is the logical day of `created_at` in that zone. `list_tasks` reads the account's `day_start` for the score's today; the result's `today` field keeps its meaning (the calendar date in `timezone`). The CLI uses its local date, as its other views do.
8. **The CLI's Today limit.** `ot today --sort urgency` lists one order; the Today limit's waiting heading is left out, since the score already orders what matters first.
9. **Cost.** The web scores only while a list is ordered by urgency: one pass over the task snapshot counts the tasks each task blocks (`blocksCount`, O(N) once per snapshot, like the other derived maps), the blocked map is the list's own, and each score is O(1), cached per row object. The server's `list_tasks` already holds the account's rows in memory (agent tools D3); it counts blockers in one pass of that snapshot and reads the time entries only with `sort: urgency`. No query, index or migration is added, so no scale count check is needed; the 10,000-task account's budgets do not cover a list ordered by urgency.
10. **A view that names a workspace** scores against the current workspace's tasks; a blocker in another workspace is not counted (dependencies stay within a sharing scope).
11. **Bundle.** The score, the scorer and the chip's glue are a shared chunk of the first load (`useUrgency`, about 1 KB gzip), the chip, the popover and the breakdown a lazy chunk loaded with the first scored row. The entry chunk grows by the Order by label, the row's `score` slot, the list's scorer wiring and the hashed name of the new chunk: measured below in the pull request; `web/bundle-budget.json` is raised by that minimum.
