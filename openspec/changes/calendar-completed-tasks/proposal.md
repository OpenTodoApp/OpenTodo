# Proposal

## Why

Completing a dated task removes it from the Calendar, so reviewing finished work alongside the remaining schedule requires switching views. An optional completed-task display keeps that context without cluttering the default calendar. Addresses [#624](https://github.com/OpenTodoApp/OpenTodo/issues/624).

## What Changes

- Add a Show completed toggle button to the existing Calendar header, off by default and remembered on this device across Day, Week, Month and Plan.
- Show completed tasks on their scheduled due date and time with struck-through titles and an accessible completed status, including phone layouts and overflow lists.
- Keep completed tasks out of remaining planned capacity and recurring projection sources. They can be selected and opened, but scheduling gestures and completion shortcuts do not change them.
- Keep deleted tasks, undated tasks and archived-project tasks excluded; render entirely from local data, including offline.
- Update the calendar guide, all shipped message catalogs, regression coverage and review screenshots.

Out of scope: calendar feeds/exports, completion-date analytics, account-wide synced display preferences, new task fields, new calendar filters and reopening tasks directly in the calendar. This increment improves the Calendar area of ROADMAP.md (shipped Month view and timeline, item 11); it does not implement the broader planned `calendar-clarity` change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `time-blocking`: optional completed-task visibility shared by all calendar modes and read-only completed blocks and lane entries.
- `month-view`: include completed tasks when opted in, preserving the cell ordering, narrow layout and open-task capacity.
- `planner-view`: include completed task rows when opted in, preserving open-series projections and capacity calculations.

## Impact

Client calendar selectors, a local display preference, existing calendar headers and task renderers, tests, translations and documentation. No API, server, op schema or migration changes, no dependencies, new network calls or environment variables. Existing task edits continue through ops; changing visibility creates no task ops.
