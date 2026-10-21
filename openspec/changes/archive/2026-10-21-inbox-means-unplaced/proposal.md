## Why

The Inbox today is "every open task without a project", so a task the user has already planned (due Friday, starting next week, parked in Someday) keeps sitting in the Inbox until it gets a project. Feedback from 2026-10-21: "I planned and scheduled tasks that are still visible in the Inbox; when are tasks not in the Inbox any more?" Tasks do not need a project in this app; a decision about *when* is as much a decision as a decision about *where*. Processing the Inbox is also clumsier than the rest of the app since `task-panel-polish` (2026-10-21): scheduling in Process the Inbox still uses the old date field, shows dates outside the user's date format, and cannot say "a week before the deadline". And the moment the Inbox is empty is marked by one line of text.

## What Changes

- **BEHAVIOUR CHANGE (no data change):** a task is in the Inbox only while it has no project **and** is not scheduled. "Scheduled" means it has a do-on date (`due`), a start date, or is parked in Someday. A deadline alone, a reminder alone or a label does not schedule a task. Removing the date from a task without a project puts it back in the Inbox. Nothing is written to any task: membership is computed from the same fields on every device, offline, and converges with them.
- One definition of Inbox membership, used everywhere the Inbox is counted or listed: the Inbox view, its sidebar and tab bar counts, the Process control, the triage queue, the weekly review's Get clear step, the Daily check, the Loop home pulse, the CLI (`ot inbox`, `ot list --inbox`), the MCP `list_tasks` view and `opentodo://views/inbox`, `today_summary`, and the in-app assistant's view names. The web definition and the Go definition are pinned by shared test vectors.
- The Inbox view loses its Later group (deferred and parked tasks are scheduled, so they are no longer Inbox tasks). A deferred task without a project and without a do-on date is listed in Upcoming on its start date with its "Starts" chip, so it is never unreachable.
- The Inbox shows one quiet line under its header, "N planned tasks without a project", that opens the Filter view with `no project`, so people can find where their planned tasks went. Quick add in the Inbox that sets a date says where the task went ("Added to Friday") with a link, instead of the task silently not appearing.
- Project pickers name the no-project choice "No project" (with the Inbox icon, also found by typing "inbox"), because choosing it no longer guarantees the task appears in the Inbox.
- **Process the Inbox, scheduling:** `s` opens the same Do on editor as the task panel (quick choices, worded date field with preview in the user's date format, visible month calendar, time). When the task has a deadline, a row of relative choices comes first: **On the deadline**, **1 day before**, **3 days before**, **1 week before**, **2 weeks before**, **1 month before**, each with the date it means, each on a number key `1`–`6`; choices that fall before today are not offered. The triage decision "Today" (`t`) and every schedule decision now take the task out of the Inbox; the queue keeps counting decided tasks so "n of N" stays stable during a session.
- **Inbox zero illustration:** the empty Inbox and the end of Process the Inbox show a calm line illustration above "Inbox zero: every task has a place." It is the first of a set of illustrations whose style rules (inline SVG, design tokens only, light and dark, decorative, small byte budget) are added to the design system so later ones match.

Out of scope: a new sidebar destination for tasks without a project (the filter line covers it within the sidebar budget); changing what Today, Anytime or Someday list; changing the `due`/`start`/`deadline` fields themselves; any server-side Inbox write; illustrations for other empty states (later changes reuse the style).

ROADMAP: advances the Open Loops "Catch → Clarify" flow (`inbox-triage`) and the calm-interface work started by `ux-overhaul`. No new environment variable; no op-log format change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-organization`: "Inbox is the default container" becomes the Inbox membership rule (no project and not scheduled); the open-task count of the Inbox follows it.
- `web-app`: the Inbox standard view lists unscheduled tasks without a project, shows the planned-tasks line, and quick add in the Inbox reports where a dated task went.
- `inbox-triage`: the queue uses the new membership rule and keeps decided tasks counted; `t` and schedule decisions leave the Inbox; `s` opens the Do on editor with relative-to-deadline choices; the Inbox zero state carries the illustration.
- `start-dates`: deferred and parked tasks without a project are no longer listed in an Inbox Later group; a deferred task without a project and without a do-on date is listed in Upcoming on its start date.
- `entity-pickers`: the no-project option of project pickers is named "No project".
- `cli-client`: `ot list --inbox` and `ot inbox` use the membership rule.
- `mcp-server`: the `inbox` view of `list_tasks`, `opentodo://views/inbox` and the Inbox count of `today_summary` use the membership rule.
- `design-system`: a requirement for illustrations (style, tokens, themes, accessibility, size) and the empty-state pattern's optional illustration slot.

## Impact

- Web: the list model and counts (`web/src/lib/views.ts`, `listGroups.ts`, sidebar and tab bar counts), `TriageView.tsx`, the Do on editor reused in triage, the method pulse (`lib/method/pulse.ts`), the weekly review and Daily check, quick add feedback, `ProjectPickerField`, `ui/patterns/EmptyState.tsx`, a new illustration component, locales (five catalogs).
- Go: one shared Inbox membership helper used by `internal/agenttools/read.go` (`list_tasks`, `today_summary`), `internal/mcp/resources.go`, `internal/cli/cmd_tasks.go`, `internal/assistant/loop.go`; shared vectors with the web helper.
- Docs: `docs/today-and-upcoming.md`, `docs/process-the-inbox.md`, `docs/deadlines-and-start-dates.md`, `docs/cli.md`, `docs/mcp.md`, `docs/design-system.md`; CHANGELOG entry under Changed with the behaviour change stated plainly.
- No dependency, no migration, no change to the op schema, export or REST task representation. Bundle growth: the illustration (under 4 KB of SVG) and a few hundred bytes of logic.
