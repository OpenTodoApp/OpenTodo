# Unread changes count what there is to read

## Why

A shared grocery list with 20 open tasks showed a blue **40** next to its grey **20** in the sidebar. It looked like 40 items, but it was 40 unread events by the other member. 24 of them were drags: reordering the list, or nesting an item under another and taking it back out. Each drag of the same item more than 5 seconds after the last one is a new event, so building a list counts several times over.

Three things make the count misleading:

- **Rearranging counts as news.** A drag changes no task anyone needs to read about, but it counts the same as an added or completed task.
- **Looking at the list doesn't clear it.** Only the Updates feed and the project's Activity view mark a project seen, so the count stays while the person reads the very list it is about, and keeps growing while they watch.
- **A number next to a number.** A filled count beside the open-task count reads as a second task count. `docs/interface-guide.md` already says sidebar state is "one accent dot … never a filled badge".

## What Changes

- An event that only changes where a task or project sits (`position`, `parent_id`, `section_id`) is never unread. It stays in the feed and in the project's activity.
- While a shared project's list is on screen, the project is kept seen up to its newest event, as opening its activity does.
- A shared project with unread changes shows an accent dot (`StatusDot`, named "Unread changes") instead of a count. The total on Updates is unchanged.

No new op field, entity, route, setting, dependency or shortcut; `feed_seen_at` is written as before. Not **BREAKING**.

## Out of scope

- How events are derived (`internal/activity`, the shared fixture): what an event is doesn't change, only what counts as unread.
- The Updates total and Workspace activity, which marks nothing seen.

ROADMAP.md: none (a fix to `activity-feed`).

## Capabilities

### Modified Capabilities

- `activity-feed`: "Unread tracking per project" leaves rearrangements out; "Marking as seen" adds the project list; "Unread indicators in the sidebar" shows a dot per project.

## Impact

- Web: `web/src/lib/feed.ts` (`isArrangement`, `countsAsUnread`, `useMarkProjectSeen`), `web/src/app/TaskListView.tsx`, `web/src/app/Sidebar.tsx`, `web/src/app/FeedView.tsx` (the feed's unread dot follows the same rule); "unread changes" becomes "Unread changes" in every catalogue.
- Docs: `docs/comments-and-activity.md`; `changelog.d/Changed/quiet-unread.md`.
- Size: a few lines; no first-load change.
