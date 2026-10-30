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

- **Order by** lists **Urgency** after Title and before the custom fields. Choosing it sets the direction to descending; the user may switch it under More options.
- **Score chip:** only while the list is ordered by urgency, each top-level row shows the score with one decimal in `text-faint`, tabular figures, in the row's trailing group (`data-row-trailing`), before the origin. It is a button: hovering shows the breakdown in the design-system Tooltip; focusing it with Tab and pressing Enter opens it as a Popover, Escape closes it. The name is "Urgency 23.0, show why" (the chip shows one decimal, the breakdown two). Subtask rows show no chip.
- **Phone:** the phone row keeps its one cell (interface guide, "On a phone"), so no chip is drawn. Under urgency order the touch row menu adds "Why here?", which opens the breakdown in a bottom sheet.
- The task page and the detail panel do not show the score: it explains an order, so it lives with the order.

Interface budget: no chrome row is added (the choice is inside the display panel); the chip is not a task property (it is an order indicator shown only when asked for, like the time column), so the seven-property limit is unchanged; no sidebar destination; no scroll region; no new shortcut.

Progressive disclosure: nothing changes until someone picks Urgency in Order by. Simple-list users never see it; the defaults stay manual order (projects, labels) and due date (views).

## D5. Server and tools

`internal/urgency` exports `Score(task, ctx) Result` with `ctx` holding today, zone, the set of task ids that are open blockers of open tasks, and the running entry's task id. The MCP `list_tasks` tool gains `sort` (`default` | `urgency`); with `urgency` it orders the page by score (ties as in D1), adds `urgency` (number) and `urgency_parts` (`[{key, value}]`) to each result, and computes `today` from the `timezone` argument (the account's day start applies, as for other tool dates). Cursors stay stable within a sort. The CLI `ot list --sort urgency` sorts what it fetched with the same package and prints the score as a column (and in `--json`). No REST task route sorts server-side today, so REST gets nothing beyond `/api/v1/views` accepting the value.

Encrypted accounts: the score reads no content, so the server-side tools compute it from the same rows on encrypted accounts.

Size: no dependency; image size and memory unchanged within noise.
