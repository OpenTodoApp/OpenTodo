# Design

## Context

Inbox membership is "open task with `project_id` null" and is repeated in many places: the web list model (`web/src/lib/views.ts`, `listGroups.ts`, `task-list/useListModel.ts`), the sidebar and tab bar counts, `TriageView.tsx`, the Open Loops pulse (`lib/method/pulse.ts`), the weekly review and Daily check, and in Go `internal/agenttools/read.go` (`list_tasks` view `inbox`, `today_summary`), `internal/mcp/resources.go`, `internal/cli/cmd_tasks.go` and `internal/assistant/loop.go`. The Inbox view also hosts the Later group of deferred and parked project-less tasks (`start-dates`). The filter grammar already has `no project`. The triage sheet for `s` is the old `DateField`, which is why its dates ignore the date-format preference and why it has none of the Do on segment's quick choices. In this app `due` is the day you plan to do a task ("Do on") and `deadline` is the day it must be done by (`deadlines` spec); relative choices therefore count back from the deadline and write `due`.

## Goals / Non-Goals

**Goals:**
- One Inbox predicate, identical on the web and in Go, pinned by shared vectors.
- No task disappears from every list because of the new rule.
- Process the Inbox schedules with the same editor and formatting as the panel, plus deadline-relative choices.
- An illustration style that later empty states can follow without a new design pass.

**Non-Goals:**
- A sidebar destination for tasks without a project (the interface budget allows at most 6 primary destinations; the Inbox line and the `no project` filter cover it).
- Relative choices outside triage (the panel's Do on segment can adopt them later from the same helper).
- Server-side Inbox logic beyond the reads that already exist.

## Decisions

**D1. What "scheduled" means (default chosen with the maintainer; confirm before apply).** A task is scheduled when `due` is set, or `start` is a date, or `start` is `someday`. A deadline alone does not schedule a task: a deadline says when it must be done, not when the user decided to do it, so the task still needs clarifying. Reminders, repeat rules without a due, labels and assignees do not schedule either. Alternatives: count the deadline too (simpler for users who only ever set deadlines, but an Inbox task with a deadline would vanish without a plan); count only `due` (would strand Someday and deferred tasks in the Inbox, against the user's request). The predicate needs no "today": a start in the past and a start in the future both schedule, so membership never changes with the clock, only with fields.

**D2. One predicate, two languages.** `isInboxTask(task)` in `web/src/lib/` and `inbox.IsTask` (or a function in an existing small package such as `internal/zoned`'s neighbour; a new `internal/inbox` package of a few lines is preferred so the CLI, agent tools and assistant import it without cycles), both read `project_id`, `due`, `start`, `completed`, `deleted_at`. A JSON vectors file under `internal/inbox/testdata/` is read by a Go test and a vitest test, as the parser and recurrence already do. Every listed caller switches to it; a grep-based test fails when `project_id` null is used as an Inbox test outside the helper in the files named above. Alternative: compute membership on the server and sync it — rejected, it would be a derived field in the op log and break offline.

**D3. Where scheduled project-less tasks live.** Due and started tasks are already in Today and Upcoming; parked ones in Someday. The only gap is a deferred task (future start) with no due and no project: today it lives only in the Inbox's Later group, which goes away. It is listed in Upcoming under its start date with its "Starts" chip. This is limited to project-less tasks so project views keep their Later groups and Upcoming keeps its meaning for everything else. Alternative: list every deferred task in Upcoming on its start date (closer to Things); deferred to a later change because it changes Upcoming for all projects.

**D4. The planned-tasks line.** One quiet text line under the Inbox header, counted with the same predicate's complement (no project, scheduled, open), opening the Filter view with `no project`. It is chrome inside the header area, not a second toolbar row; on phones it wraps under the title. It is hidden when the count is zero. Alternative: an Inbox segment "Unplaced / Planned" — rejected as a second mode inside a list.

**D5. Quick add feedback.** Quick add in the Inbox already parses dates. When the created task fails the predicate, the existing toast surface announces "Added to <day>" (or "Added to Someday" / "Added to Upcoming, starts <day>") with an Open control; no new component.

**D6. "No project" in pickers.** The data stays `project_id: null`. Pickers show "No project" with the inbox icon and keyword "inbox", so typing "inbox" still finds it. The Move-to-Inbox wording in MCP tool descriptions becomes "no project (Inbox when not scheduled)". The sidebar entry stays "Inbox".

**D7. Triage queue stability.** The queue is a list of ids fixed at open time plus appended arrivals. A task leaves it when it stops being an Inbox task through a change the mode did not make (another device, an edit in the panel opened from the card). Tasks the user decided on stay as counted entries, so "n of N" behaves like today when a scheduled task used to stay in the Inbox. `k` can return to a decided task, which is shown with its new state.

**D8. Scheduling sheet.** Reuse the Do on segment's pieces (`quickChoices`, the worded `DatePicker` field, `CalendarGrid compact`) inside a sheet; the relative row is a small pure function `relativeDoOn(deadline, today)` returning `[{key, label, date}]`, with month arithmetic clamping to the month's last day. Number keys are registered in the shortcut registry under the triage scope while the sheet is open; they do not collide with priority keys because priority is not a triage decision. Writes go through the same `updateTask` path as the panel, so time, evening and repeat are kept as the Do on segment keeps them.

**D9. Illustration style.** Inline SVG React components in `web/src/ui/illustrations/` using `currentColor` and CSS variables from `web/src/index.css` only; one `stroke-width` (1.5 at 160 px), round caps and joins; an optional accent shape at 15 % opacity; no text. They sit in the empty-state pattern's icon slot through a new `illustration` prop. `make ui-lint` gains a check over that folder: no hex colours, no `<image>`, no `xlink:href`, size under 4 KB. Stories show each illustration in light and dark. The first one, Inbox zero, is an open tray drawn in line with a small leaf resting beside it. Alternatives: Lottie or raster art (rejected: dependency, theming, size); emoji (forbidden by the design rules).

**Interface budget:** no new chrome row above a list's first item (the planned-tasks line is inside the header block, hidden at zero), no new task property, no new sidebar destination, no new scroll region; the triage sheet is an overlay with one scroll region on phones; new keys `1`–`6` exist only while the sheet is open and are registered in the triage scope without conflicts.

**Data model:** no new field, no op change, no migration. Membership is derived.

**Size:** the illustration is under 4 KB of SVG in the main bundle; logic adds a few hundred bytes; no dependency; no change to image size or server memory.

## Risks / Trade-offs

- [Users who relied on the Inbox as "everything without a project"] → the planned-tasks line, the CHANGELOG "Changed" entry stating the rule, and the `no project` filter; the rule is visible in the Process the Inbox and Today/Upcoming docs.
- [A deferred project-less task with a due date shows in Upcoming under its due date only, while deferred] → unchanged from today's `start-dates` behaviour for tasks with a due; documented.
- [Other clients (older app versions) still show scheduled tasks in their Inbox until updated] → harmless: no data differs; the rule is view logic.
- [Divergence between Go and web predicates] → shared vectors and the grep test of D2.
- [Relative choices on a recurring task with a deadline] → the deadline is per task, not per occurrence; choices write `due` like any schedule decision, and the repeat rule keeps generating from it as the Do on segment does.

## Migration Plan

Ship web and server together; nothing to migrate. Rollback is a code revert with no data effect.

## Open Questions

- ~~D1's definition of "scheduled"~~ **Confirmed by the maintainer (2026-10-21):** a do-on date, a start date (past or future) or Someday schedules a task; a deadline alone, a reminder or a label does not.

## Notes from implementation

- **One predicate, as planned.** `web/src/lib/inbox.ts` (`isInboxTask`, `isPlannedWithoutProject`) and `internal/inbox` (`IsTask`, `Scheduled`) read `web/src/lib/inbox.vectors.json`. `lib/triage.ts` `qualifies` (used by triage, the review, the Daily check, the Loop home and pulse) is `parent_id === null && isInboxTask`. The guards are `web/src/lib/inboxGuard.test.ts` (no unmarked `project_id` null test in the listed web files; a line with another reason carries `inbox-rule-ok`) and `internal/inbox/guard_test.go` (every filtering `case "inbox":` branch of `agenttools/read.go` and `cli/cmd_tasks.go` calls `inInbox`). The assistant (`internal/assistant/loop.go`) only names views and reads through `list_tasks`, so it needed no change; `list_projects`' `inbox_open_count` follows the rule too.
- **Bottom sheet below 640 px, not 768.** The sheet is the dialog primitive with `placement="sheet"`, whose breakpoint is 640 px; between 640 and 768 px it is the centred card. Every choice is 44 px on touch (the relative row always, the reused quick choices through `touch-target`).
- **Keys `1`–`6`** are the registry entry `triage.relative` (view `triage`, `dialog: true`, so they work inside the sheet and never in its date field). It declares `overrides: ['vim.priority']`, which binds `1`–`4` in Normal mode outside dialogs; the conflict test requires the override.
- **The planned-tasks line** sits in the header's meta at 768 px and up, and in the page's wrapping action row below it (the phone bar has no meta), hidden at zero in both.
- **"Added to …"** uses the existing undo toast, which gained an optional second control (`action`), shown until it is used or the toast times out.
- **Empty Inbox sentence.** The empty Inbox view now reads "Inbox zero: every task has a place." with the illustration, like the end of Process the Inbox; "Your Inbox is empty." is gone. The empty-state pattern takes the illustration by name (`illustration="inbox-zero"`), so views still pass data, not nodes; its contract test allows only `data-illustration` drawings.
- **Tests that relied on the old rule** were moved to a project (the inline editor's Date choice, the Someday keys and the Later group) or rewritten to the new scenarios; a recorded MCP client fixture (`desktop-assistant.json`) now expects `inbox: 0` for its overdue task without a project.

### Follow-up: subtasks follow their parent

After release, a scheduled parent left the Inbox while its subtasks, which had no project or date of their own, stayed in it. A subtask is part of its parent's plan, so the rule now also looks up the parents: a task is in the Inbox only while neither it nor any task above it is placed. The parent's own state (open, completed, deleted) does not matter, only whether it is placed, so an open subtask of a completed, unplaced parent stays visible. Every reader already has all tasks at hand, so each builds one id lookup per pass; the walk stops after 64 levels to survive a cycle in synced data.
