# Design

## D1: A rearrangement is never unread

An event whose changed fields are all among `position`, `parent_id` and `section_id`, on a task or a project, does not count as unread (`isArrangement` in `web/src/lib/feed.ts`). An event that also changes anything else (a rename with a drag in the same moment) counts. The rule only reads the event's fields, so it applies the same way to events from local ops and to pages from the server, offline as online, and the feed's unread dot uses the same predicate (`countsAsUnread`).

Moving a task to another project (`project_id`) still counts: it changes which list the task is in, for both lists.

## D2: The list on screen is seen

`useMarkProjectSeen(projectId)` in `TaskListView` reads the newest event of a shared project live and calls the existing `markSeen` with its time. `markSeen` already debounces (400 ms, one op per project) and never moves the mark backwards, so a burst of syncs while the list is open becomes one op, and two devices converge to the later time as before. It marks only while `document.visibilityState` is `visible`, and again on `visibilitychange`, as `web/src/page/TaskPageScreen.tsx` reloads: a background tab or a laptop left open on the list overnight must not mark what nobody saw. A personal project writes nothing. Only the project route marks; Today, Upcoming and filters that show a shared project's tasks do not, because they don't show the project's changes as a whole.

## D3: A dot on project rows

The per-project count becomes `StatusDot` with the label "Unread changes" (its tooltip and accessible name). The Updates entry keeps its count, where a number answers "how much is there to read". This follows `docs/interface-guide.md` ("one accent dot … never a filled badge").

## Data model

None. `project_prefs.feed_seen_at` is written by the same function; only when it's written changes.

## Interface budget

No chrome, property, destination, scroll region or shortcut is added; a row's badge gets smaller.
