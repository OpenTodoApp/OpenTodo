# Design

## D1. A mapping, never created calendars

The person matches projects to calendars that already exist and are writable; OpenTodo never creates calendars (Google's CalDAV cannot, and an app that fills a calendar list on its own is unwelcome). The dialog offers **Create it in your calendar app, then Sync now** when the list lacks one.

## D2. Storage and the cycle

`calsync_project_targets(connection_id, project_id, calendar_url, PRIMARY KEY(connection_id, project_id))`. A task's target is its nearest matched project (itself, then its ancestors), else the connection's target. Links gain `calendar_url`; a task whose target changed is removed from the old calendar and created in the new one in the same cycle (within the 200 writes). The pull reads every calendar that is a target. The limit of read calendars per connection stays.

## D3. Moves from the calendar side

A linked event found in another target calendar (CalDAV: a different collection; Graph: a different calendar id) moves the task to the project matched to that calendar when exactly one project is matched to it; else the event is written back to its own calendar.
