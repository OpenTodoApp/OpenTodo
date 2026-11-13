# Design

## D1. A mapping, never created calendars

The person matches projects to calendars that already exist and are writable; OpenTodo never creates calendars (Google's CalDAV cannot, and an app that fills a calendar list on its own is unwelcome). The dialog offers **Create it in your calendar app, then Sync now** when the list lacks one.

## D2. Storage and the cycle

`calsync_project_targets(connection_id, project_id, calendar_url, PRIMARY KEY(connection_id, project_id))`. A task's target is its nearest matched project (itself, then its ancestors), else the connection's target. Links gain `calendar_url`; a task whose target changed is removed from the old calendar and created in the new one in the same cycle (within the 200 writes). The pull reads every calendar that is a target. The limit of read calendars per connection stays.

## D3. Moves from the calendar side

Kept out of this change. Each calendar is synced on its own cursor, so an event moved in the calendar app to another calendar reads as deleted from the first and is answered like any deleted event; the copy in the other calendar is not linked. Reading it as a move would need the two pulls to be matched in one cycle, which is a later change if people ask for it. Moves made in OpenTodo work: a task moved to a project with another calendar has its event deleted from the old calendar and written to the new one in the same cycle.

The Inbox has no row of its own: tasks without a project go to the target calendar, which keeps the dialog to the projects people actually split.
