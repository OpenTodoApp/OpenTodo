# Server query costs: dependencies, activity feed, public links, memberships and CalDAV

## Why

The audit found server reads whose cost grows with the size of the data rather than with what a request asks for (CORE-3, CORE-8, CORE-15, CORE-19, INT-9):

- Saving a "blocked by" dependency read the scope's whole dependency graph from the database for each op. A batch of 1,000 dependencies on a 10,000-task project held the only database connection for 10 to 23 seconds, blocking every other user.
- Every page of the activity feed read the whole op history of every shared project the user belongs to, including the encoded notes documents the feed never shows, and only then picked the page in Go.
- The anonymous public view of a project ran one query per task (a 5,000-task project cost 5,000 queries per view, on a route anyone with the link can call).
- Listing a user's memberships, which every sync does, ran one query per shared project.
- A CalDAV multiget scanned every task of the account for each href (O(hrefs x tasks)), and a calendar-query encoded each task twice and re-parsed it even for the plain "all tasks" filter.

## What Changes

- A sync batch reads a scope's dependency graph once and keeps it up to date in memory as its own blocked_by ops are stored, following last-writer-wins. A partial index (migration 0038) makes reading a graph proportional to the tasks that have dependencies, which also speeds up the "task unblocked" check after every completion.
- The activity feed reads entities newest first, a few more per round, and stops as soon as the page and whether another follows are certain; each entity's history is read whole, so every event (id, grouping, changes, kind) is the one the whole history gives. Encoded document fields are never read.
- The public project view reads all sections in one query and all tasks in one query.
- Memberships reads the members of all the user's shared projects in one query.
- CalDAV indexes the loaded view once per request (tasks per calendar, by resource name, by UID); calendar-query encodes each task once and skips parsing for the plain VCALENDAR > VTODO filter. App password last-use writes were already throttled (bound-server-resources).

Not **BREAKING**: no new environment variable, no op or op-schema change. The only schema change is an additive, idempotent index. Responses are unchanged except that a calendar-query with the plain filter now also returns a task whose calendar data would not parse back (for example one larger than the CalDAV body limit), as PROPFIND and sync-collection already did.

Advances no ROADMAP item; it hardens `activity-feed`, `caldav`, `public-links`, `project-sharing` and `task-dependencies`.

## Out of scope

- The read-only connection pool and the List/Pull query plans (CORE-6, CORE-7, a separate change).
- Loading less of the account per CalDAV request (the view is still loaded whole once; a PUT still reloads it to return the new ETag).
- The feed's per-project entity listing still scans the projects' op index once per request (light columns only); a time index on ops is not added.
