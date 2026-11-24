# Design: personal-views-assignee

## D1. One predicate, the viewer's id

`assignedToSomeoneElse(task, me)` in `web/src/lib/dayLists.ts` is true when the task has an assignee and it is not `me`. It no longer looks at the membership cache: a task can only be assigned to someone else in a shared project, and a departed member's tasks are unassigned by server ops. That is the digest's rule in `internal/digest/stats.go`, and `today_summary` in `internal/agenttools` uses the same test, so every surface agrees. Without a viewer (signed out, or a test that passes none) nothing is left out.

`todayList`, `upcomingList`, `upcomingWithToday`, `nextDays` and `earlierIds` take `me`; `tasksForView` and `patchViewTasks` use the `userId` they already took for Assigned to me, for Today, Upcoming, Someday and Anytime. The sidebar counts, the badge counts, the briefing, the palette, the display, Close the day, the daily check and the shell widgets pass the viewer's id instead of the old filter object built from the preference. The Inbox needs no change: an Inbox task can only be assigned to its owner. Next already required "unassigned or assigned to that user".

## D2. No setting

`todayHidesOthers`, `setTodayHidesOthers`, `todayAssigneeFilter`, `sharedWithSomeoneElse` and the Today menu item go. The op field `user_prefs.today_assignees` stays declared (the op schema is additive) and is never read or written again; a stored value is left as it is. A user who wants the full list of a project opens it; Waiting lists the tasks by assignee; the Filter view's `assigned` terms build any other list.

## D3. Data model, offline and convergence

None changed: the rule is derived from local task rows and the account id, so it works offline and follows a reassignment from any device as soon as it syncs. No field, op or route is added.

## D4. Interface budget

One menu item fewer on Today; no new control, row of chrome, property, destination, scroll region or shortcut. No story shows another member's task in a personal view, so no UI baseline changes.

## D5. Size

No dependency; the bundle shrinks slightly.
