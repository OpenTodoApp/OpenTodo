# What OpenTodo can learn from Super Productivity

Notes from a look at [Super Productivity](https://super-productivity.com/) (checked 2026-10-19): what it is, where it is stronger than OpenTodo, and what is worth borrowing, in a suggested order. Like `UX-AUDIT.md`, this is a working document, not a spec; each item that goes ahead starts as an OpenSpec change.

## The competitor in one paragraph

Super Productivity is a free, MIT-licensed to-do list **with time tracking and timeboxing built in**. About 23k GitHub stars, 2.2k forks, versions on Windows, macOS, Linux (Flathub, Snap, Microsoft Store), Android (Play, F-Droid), iOS and the web. It is single-user and account-free: data lives on the device, with optional sync to WebDAV, Dropbox or its own end-to-end encrypted "SuperSync" (self-hostable). Its audience is developers and freelancers: it imports issues from Jira, GitHub, GitLab, Gitea, OpenProject, Redmine, Trello, Linear, ClickUp, Azure DevOps and Nextcloud Deck, logs work back to Jira, OpenProject and Redmine, and exports timesheets. The press it gets ("I ditched paid productivity apps for this free open-source alternative", How-To Geek, XDA, LinuxInsider) names the time tracking, the Pomodoro and focus modes, the break reminders and the price. Stack: Angular, Electron, Capacitor. Its documented weakness is collaboration: there is none.

## Where OpenTodo is already ahead

Not the point of this document, but worth stating so the gaps below are weighed correctly. OpenTodo has sharing with roles, assignees, comments, activity, public links and a server you own; natural-language quick add in six languages and a translated interface; two-way CalDAV, calendar feeds both ways, email to task, a browser extension, a CLI, a REST API, webhooks, MCP read and write tools and an in-app assistant; passkeys, SSO, TOTP, an audit log and end-to-end encryption; a method of its own (Open Loops) with a guided weekly review, Daily check and Monthly look; statistics, habits, custom fields, dependencies, templates, a month view and a timeline. Super Productivity has none of the collaboration, almost none of the security surface, no natural-language dates in other languages, and no assistant.

## What to borrow, in order

Ranked by how much of the competitor's appeal it captures against what it costs under OpenTodo's rules (specs first, every write an op, additive schema, no new dependencies, nothing mandatory).

### 1. Time tracking: tracked time next to the estimate

Super Productivity's whole identity is **press play on a task**. Tracked time shows against the estimate on the row, per day in the Today list, and in a worklog you export as a timesheet. OpenTodo has estimates (`estimate_minutes`), capacity bars and the calendar, so the planning half exists; the "what actually happened" half does not, and the roadmap explicitly set "a focus timer with time tracking" aside.

Why now: it is the single feature the press names first, it is what makes the freelancer, client-tracker and consultant templates on the website usable, and it closes the loop on estimates (the only way people learn to estimate is to see where they were wrong).

How it fits: a new entity `time_entries` (`task_id`, `started_at`, `ended_at`, `device_id`, optional `note`), each a row written through the op log so entries from two devices never conflict; one "running" entry per user, stopped by the next start. Rows show `35m / 1h` once an entry exists; the Today view shows the day's tracked total under the planned one; Statistics gains tracked time per project and per day; `ot time start|stop|log`, a CSV export of entries (date, task, project, labels, custom fields, minutes) and a `tracked` filter keyword. Content never enters an entry, so end-to-end encryption needs no change. The `y` key is free in list scope (only the triage view uses it). Change name: `time-tracking`.

### 2. Focus mode: Pomodoro, Flowtime and countdown, plus break reminders

Their focus screen shows one task with a timer in one of three modes: fixed Pomodoro cycles with auto breaks, Flowtime (open-ended, you stop), and a countdown you choose per session. Starting a session starts tracking that task; pausing it pauses the clock. A separate **break reminder** shows a banner after N minutes of work without a break.

OpenTodo's Daily check already picks up to three tasks as today's focus; a focus mode is the natural "do" step after it, and the Open Loops method has a Do move with nowhere to do it. Builds on item 1 (a session is a time entry), is almost entirely client-side (timer state in the device's local store, sound and a notification through the existing service worker), one settings card (mode, lengths, break reminder on/off). Change name: `focus-mode`.

### 3. Finish Day: an end-of-day ritual

Their Today list ends in a **Finish Day** button: a summary of the day (planned, done, tracked), unfinished tasks moved to tomorrow or back to the backlog in one step, optional one-line metrics (mood, productivity), then "Save and go home". OpenTodo has the morning half (Daily check) and the weekly review, but nothing closes the day, and overdue tasks pile up in Today with no single move to replan them.

Small change, large effect: a **Close the day** step reachable from Today and the Loop home, reusing the review stepper and the bulk reschedule from `bulk-edit` ("Move the 4 unfinished tasks to tomorrow" as one batch, undone in one step), with the Loop pulse's numbers for the summary. The rhythm markers in `weekly-review` already know when the Daily check was done; a `closed_at` on the review row records the close. Change name: `close-the-day`.

### 4. A day boundary for night owls

Their Today runs on a "logical day" whose start you can move (Settings → Start time of next day), so a task finished at 1 a.m. counts for the day you are still living. OpenTodo's Today, Statistics and habits all use midnight. A `day_start` preference next to the first day of the week in `date-time-preferences`, honoured by Today, the Daily check, habits and Statistics. Tiny, and a frequent request in every task app's tracker. Change name: `day-boundary`.

### 5. The Planner: days as columns with capacity, including what repeats

Their Planner is a rolling two-week board with one column per day: drop a task on a day to date it (no time), each column shows planned minutes against work hours as a percentage, and **future occurrences of repeating tasks and calendar events are projected into the days** so capacity is honest. OpenTodo's Upcoming groups by day but is a list, shows no capacity, and shows a recurring task only on its next date; the Week grid shows capacity but lives at the hour level.

Add a **Plan** mode to Upcoming (or a fourth calendar mode next to Day, Week and Month): day columns for the next 14 days, drag between columns, the capacity bar from `time-blocking`, projected occurrences drawn dimmed (computed on the device from the rule, never written), calendar-feed events counted in the capacity. Change name: `planner-view`.

### 6. Boards whose columns are rules, and an Eisenhower board out of the box

Their boards are not tied to a project: each column is a filter (tags, done state, scheduled or not, projects) and **moving a card into a column applies the column's changes** (add or remove a tag, mark done, schedule, move to a project). Kanban and an Eisenhower matrix (urgent × important) ship as defaults; a task can sit on several boards.

OpenTodo's board is a project's sections, and its dashboards are read-only boards of filters. Adding an optional "on drop" rule to a dashboard column (set a label, priority, date or section) turns dashboards into working boards, and an Eisenhower board becomes a built-in dashboard template (p1 and due soon, p1 and later, p3/p4 and due soon, the rest). All of it is the existing filter language plus one additive `on_drop` object on the saved view. Change name: `rule-boards`.

### 7. Developer integrations: issues as tasks

Thirteen issue providers is their moat with developers, and the Linear comparison on open-todo.app already concedes "no built-in code integration". Copying thirteen providers is out of scope; two things are not:

- **An `origin` on a task** (`{provider, id, url, title}`, additive, in `ContentFields` because the title is content): shown as a chip that opens the issue, written by the importer, the CLI, the extension (which already captures pages) and webhooks. This alone makes a task "the GitHub issue" instead of a pasted link.
- **GitHub and GitLab: import my open issues as tasks, keep them fresh.** A per-user connection (token stored like calendar-feed credentials, requests through `internal/outbound`, refused on the demo), a scheduled poll on the jobs leader that creates tasks for newly assigned issues and completes or re-titles existing ones, nothing written back in the first version. Jira has the same shape and a bigger audience; do it second.

Change names: `task-origin`, then `github-gitlab-issues`.

### 8. Short-syntax details

Their quick add has two ideas OpenTodo's six-language parser lacks: **`30m/2h` (spent / estimate)** which only makes sense with item 1, and **`@2monday` (the second Monday of the month)**. Add both to `internal/quickadd` and `web/src/lib/nlp` with shared vectors. Half a day each. Fits into `time-tracking` and `quick-add-recurrence`.

### 9. Idle detection and a desktop presence

Their desktop app notices when you leave the computer and asks what to do with the gap (keep it on the task, count it as a break, drop it); the web version needs their extension for it. This is what makes time tracking trustworthy. The browser's Idle Detection API is Chromium-only and permissioned, so the honest version in a PWA is modest: stop the running timer when the tab has been hidden for N minutes and ask on return. The real answer is the desktop shell the roadmap set aside (a thin wrapper around the embedded server), which would also give a tray timer and global shortcuts. Keep it set aside until items 1 and 2 show demand, then revisit with idle detection as its first justification.

### 10. Website and distribution lessons

Not app work, but they explain the star count more than any feature does:

- **Use-case pages** ("Free Pomodoro timer for deep work", "Freelancer time tracking", an ADHD workflow guide) rank for the problem, not the product. open-todo.app has comparisons and templates; it has no pages for the problems people search for.
- **A comparison page for Super Productivity** belongs in `src/content/compare/` next to Todoist, Things and Linear: the audience overlap (open source, local-first, privacy) is the largest of the four, and the honest gaps (time tracking, focus mode, desktop apps, issue integrations) are exactly this list, while OpenTodo wins on sharing, server, security, CalDAV, assistant and languages.
- **Store listings.** Flathub, the Microsoft Store, Play and F-Droid are where people find them; OpenTodo's install story is a container. The desktop shell above would also be a store listing.
- **"No account needed"** is their first promise. OpenTodo needs an owner account by design; the demo instance is the answer, so link it from every page's first screen.

## What not to copy

- **The plugin system.** Plugins run unsandboxed in the renderer and can request Node access; their own guide says they are "not strongly sandboxed from the app". OpenTodo's extension points (webhooks, REST, CLI, MCP, agent skills) stay outside the process and keep the threat model intact. If people ask for plugins, the answer is a documented recipe per use case on those surfaces, not in-process code.
- **A second sync model.** WebDAV and Dropbox file sync is what a single-user, account-free app has to do; OpenTodo's op log is strictly better for several devices and several people. Keep one.
- **Angular and Electron bundle sizes**, and metrics-for-their-own-sake (mood and productivity scores) before the plain numbers prove useful.

## Suggested order and sizes

| # | Change | Size | Depends on |
| --- | --- | --- | --- |
| 1 | `time-tracking` | L | — |
| 2 | `focus-mode` | M | 1 |
| 3 | `close-the-day` | S | — |
| 4 | `day-boundary` | S | — |
| 5 | `planner-view` | M | — |
| 6 | `rule-boards` | M | — |
| 7 | `task-origin`, then `github-gitlab-issues` | S, then L | — |
| 8 | short-syntax additions | S | 1 for `spent/estimate` |
| 9 | idle detection, desktop shell | XL | 1, 2 |
| 10 | website: use-case pages, Super Productivity comparison | S each | — |

Items 3 and 4 are the cheapest wins and need no new entity. Item 1 is the one that changes who OpenTodo is for.

## Sources

- https://super-productivity.com/ and https://super-productivity.com/pricing/
- https://github.com/johannesjo/super-productivity (README) and its wiki: The Today View, Planner View, Board View, Timers and Focus Mode, Integrations, Short Syntax, Develop a Plugin
- https://dev.to/johannesjo/getting-started-with-super-productivity-2791
- https://github.com/johannesjo/super-productivity/discussions/1286 (how breaks are counted)
- https://www.howtogeek.com/i-ditched-paid-productivity-apps-for-this-free-open-source-alternative/
- https://www.xda-developers.com/replaced-to-do-app-with-open-source-tool-never-going-back/
- https://linuxinsider.com/story/super-productivity-app-the-closest-ive-come-to-a-workflow-that-sticks-177717.html
