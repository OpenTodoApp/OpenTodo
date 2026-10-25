# Plan from a label or a saved view

## Why

Issue #369: a common weekly routine is to go through every project, label the tasks for this week (say "week"), then open the Calendar and spread that shortlist over the days. The Calendar's **Plan from a list** could only list the Inbox, tasks without a date, earlier tasks or one project, so the shortlist could not be the source.

## What Changes

- The planning list's source can also be a **label** or a **saved view** (list views; dashboards are not offered). The picker becomes the design-system Combobox, grouped into Lists, Projects, Labels and Saved views, so typing "wee" finds the label "week".
- A label lists its open tasks by due date then priority, like a project. A saved view lists the open tasks the view shows, in the view's own order (the client's existing view evaluation, `runView`), never completed ones even when the view shows them.
- The choice is remembered on the device under the same key as before (`opentodo.calendar.tray`, now also `label:<id>` and `view:<id>`); a source that is gone reads as the Inbox.

Not **BREAKING**: no op, API or storage change; the remembered project choice keeps working.

## Impact

- `web/src/app/calendar/planSource.ts` (new), `web/src/app/calendar/PlanPanel.tsx`; tests `planSource.test.tsx`, `calendarView.test.tsx`.
- Two new interface strings in six languages.
- `docs/place-tasks-on-the-calendar.md`, CHANGELOG.
