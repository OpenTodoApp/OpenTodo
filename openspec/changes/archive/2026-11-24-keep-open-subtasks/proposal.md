# Keep open subtasks

## Why

GitHub issue #1835: completing a parent always completes its open subtasks. Some people finish a task while a follow-up stays open on purpose, and want that follow-up kept, out of their lists and counts, but still reachable from the parent. The owner chose one setting rather than a question on every completion.

## What Changes

- A synced preference `user_prefs.complete_subtasks`: empty (the default and today's behaviour) completes the open subtasks with the parent; `keep` completes only the parent. Settings → General → Tasks has one switch for it, "Complete subtasks with parent", with no helper text and no per-completion dialog.
- A derived rule, with no new task field: an open task with a live completed ancestor is **kept**. Kept tasks are left out of every list of open work and every count on the web app (lists, Today, Upcoming, the calendar, filters, search and the palette, sidebar and workspace counts, the badge, progress in lists, the briefing, the display and the widgets) and on the server (the MCP and REST agent tools, `ot` lists, the weekly digest). They stay listed, editable and completable in the parent's Subtasks, and reopening the parent brings them back with no write.
- Kept tasks fire no reminders, in the browser, on phones and from the server, until the parent is reopened.
- Open subtasks of completed parents that already exist (created through MCP, `ot done` or REST, which never cascaded, or by the concurrent complete-and-add case) become kept too. The parent's Subtasks shows them, so nothing is lost.
- Undo of a completion restores both paths: every task the completion wrote is reopened.
- Every other completion path follows the same choice, so the default never leaves hidden subtasks behind: Close the day, a series that ends, automation rules and routines (web and server), the agent tools (MCP, REST agent routes, the on-device assistant), `ot done` (new: it reads the choice from `GET /api/v1/me` `keep_open_subtasks`; `--subtasks=false` completes only the task) and public links and task pages.
- The rule is in `web/src/lib/subtasks.ts` and in the new Go package `internal/kept`, pinned by shared vectors.

No new op, route, dependency or environment variable. The op schema gains one additive field.

## Out of scope

- A dialog asking on each completion (the issue's optional enhancement).
- Hiding kept tasks from CalDAV clients, calendar sync or the raw REST collections (`GET /api/v1/tasks` keeps returning every row: it is the collection other clients sync from, not a list of open work).
- A cascade on the REST collection route `PATCH /api/v1/tasks/{id}`: it keeps completing only the task it names (API 1.x).

ROADMAP.md: none (an improvement to subtasks).

## Capabilities

### Modified Capabilities

- `subtasks`: "Parent task reference" and "Completing a parent" change; "Kept subtasks" is added.
