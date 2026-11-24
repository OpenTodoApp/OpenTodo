# Personal views hide tasks assigned to others

## Why

GitHub issue #1938 (follow-up of #827): in a shared workspace the personal views disagree about tasks assigned to other people. Next already leaves them out, Today leaves them out only after the viewer turns on "Hide tasks assigned to others", and Upcoming, Anytime, Someday, the assistant's `today_summary` and the counts built on them never do. The weekly digest and Statistics already treat such a task as someone else's. One rule, with no setting, makes every personal view show the work the viewer can act on, while the project keeps the full list.

## What Changes

- Inbox, Today, Upcoming (with Start with Today too), Anytime, Someday and Next leave out a task assigned to an account other than the viewer; tasks assigned to the viewer and unassigned tasks stay. The Inbox and Next already behaved this way.
- The same rule drives what is built from them: the sidebar Today count, the app icon badge, the day-page briefing, Today's Earlier in the command palette, Today's limit slots, Close the day, the display of Today and Upcoming, the native widgets, and `today_summary` on the server and on the device.
- Today's menu loses "Hide tasks assigned to others" / "Show tasks assigned to others". The `user_prefs.today_assignees` field stays in the op schema, kept and ignored (the schema is additive).

No new mandatory environment variable, no new field, route or op, and no change to the op log format.

## Out of scope

- A workspace policy or a per-user setting to show these tasks again: the project, Waiting and the Filter view (`assigned: me`, `unassigned`) show them.
- A project's own list, Assigned to me, Waiting, labels, places, saved views, the calendar views (Planner, week, month, year) and Completed: unchanged.
- `list_tasks` and the MCP view resources: they stay queries over every visible task.
- CalDAV, calendar feeds, webhooks, the export and the digest: unchanged (the digest already leaves such tasks out).
- Hiding unassigned tasks created by someone else: the issue mentions it, but an unassigned task in a shared project is open to anyone.

ROADMAP.md: none (a bug fix).

## Capabilities

### Modified Capabilities

- `task-assignment`: "Today hides tasks assigned to others" is replaced by "Personal views hide tasks assigned to others".
- `web-app`: the standard views follow that rule.
- `builtin-view-options`, `app-icon-badge`: no longer name the removed option.
- `mcp-server`: `today_summary` follows the rule.
