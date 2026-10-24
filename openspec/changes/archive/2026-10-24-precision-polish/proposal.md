# Proposal

## Why

Precision (13 changes, 0.11) redrew the screens that had mock-ups. A tour of the screens it did not draw, at 360 and 1280 px in light and dark and with a larger browser text size, found five kinds of leftover:

- **Accent where Precision uses grey.** Selected and current items on the Trash, the Labels page, the Updates feed, calendar lanes, the timeline, the time list, the workspace list, the "When" project list, the sidebar's collapsed More button and its footer still use the green accent tint, and the selection bar is a green band. Precision keeps colour for state (late, deadline, now, done, the one main action) and shows selection in grey. The weekly review's step header is tinted green with a green icon tile and a green step line.
- **Layout that breaks with a larger text size.** Scripts decide the phone, drawer, split and two-column layouts with pixel media queries, while the stylesheet's breakpoints are in rem. With the browser's text size at Large (20 px), between 768 and 960 px wide the script thinks the sidebar is a column while the stylesheet has hidden it, and from 1024 to 1280 px the Inbox docks a task into a pane the stylesheet hides. On a phone at Large or larger, the All projects table squeezes the project name to nothing beside its health column, and the Inbox's title is cut to one letter beside Process.
- **Small layout faults.** On a phone, a Trash row squeezes its name into one-word lines beside Restore and Delete permanently, and the Updates feed centres a long project name under the event. The week agenda shows seven filled "Add a task" buttons for an empty week where Plan shows one quiet line per day. The weekly review's step title shows a focus ring when focus is moved to it by code.
- **A word that reads as a judgement.** The project health word "Slipping" reads like a nag on a side project.
- **Known issues from the Precision build:**
  - In the bulk label picker, a label picked before the menu has read the ticked tasks is added even when every task already has it.
  - On the timeline, the note after a short or late bar ("2 days late", "1 day") can run across the today line or off the end of the axis.

## What Changes

- **Grey selection.** Selected rows (Trash, Labels, Updates, calendar lanes, the timeline) use the selected-row surface; current items in short lists (the time list, the workspace list, the "When" project list, the sidebar's collapsed More and footer buttons) use the selected surface with the strong text tone. The selection bar above a list is a grey band. Choice cards with a border (token scopes, channel kinds, method modes) and the bulk tick keep the accent: they mark a choice made, not a cursor.
- **Weekly review step header.** No tint; the icon sits on the raised surface in the muted tone, and the step line ("Step 1 of 7 · Get clear") is in the faint tone. The title keeps receiving focus on each step for screen readers, without a ring, since it is not a Tab stop.
- **Breakpoints follow the text size.** Every media query a script evaluates uses rem, matching the stylesheet: 40, 48 and 64 rem. At the default text size nothing changes.
- **Narrow tables and headers.** When the All projects table is narrower than 18 rem (a phone with Large text), the health moves under the project name and the health column is hidden. Below 21 rem of viewport, Inbox's Process keeps its icon and hides its word and key.
- **Trash and Updates on a phone.** A Trash row keeps at least 12 rem for the name; Restore and Delete permanently wrap under it. The Updates feed's project line is left-aligned and truncated.
- **Week agenda.** An empty day is one quiet line, "Nothing planned." with a ghost "Add a task", as on Plan.
- **Bulk labels.** Add or remove is decided from the ticked tasks as stored when the label is picked.
- **Timeline notes.** The note after a bar moves past the today line instead of crossing it, and before the bar when it would run off the axis.
- **"Slipping" becomes "Overdue".** The project health word for "an open task is due before today" reads Overdue in every language. Feedback said "Slipping" on a side project reads like a nag; "Overdue" says what the rule checks. The internal value stays `slipping`, so nothing synced or shared changes; the detail ("2 late"), tone and rank stay.
- **Documentation screenshots.** Every screenshot in the docs is taken again from the Precision interface (separate pull request).

Out of scope:
- Statistics, Loop home and the Focus screen keep their cards: they are dashboards of numbers and read as cards on purpose. The reminder toast keeps its warning edge.
- The sign-in and invite screens keep their centred card.
- New illustrations, copy changes, or new settings.

This follows up the "Precision redesign" ROADMAP item.

No data model change, no migration, no new environment variable. Not breaking.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: grey selection surfaces and rem breakpoints (two added requirements).
- `bulk-actions`: "Labels on several tasks" decides add or remove at the pick.
- `project-timeline`: "Bars from start, due and deadline" places the note clear of the today line and the axis end.
- `task-list-presentation`: "Empty views" leaves the week agenda's days to one quiet line, as Plan's; "Words for tasks that are late" makes the project health word the one exception to "never overdue".
- `statistics`: "Project health" names the second word Overdue.
- `project-organization`: "All projects page" reads Overdue and moves the health under the name below 18 rem.

## Impact

- Web only: `web/src/app` (TrashView, LabelsView, FeedView, TimelineView, calendar/DayColumn, calendar/WeekAgenda, review/StepCard, bulk/BulkActions, ProjectsTable, task-list/ListChrome, Sidebar, SidebarFooter, WhenControl, TimeField, WorkspacesSettings, panel, Shell, SettingsView, NotificationBell, MonthView), `web/src/ui` (useMediaQuery, PageHeader, overlay/stack, overlay/Toasts, test-utils).
- UI baselines move for the screens above.
- Bundle size: no new dependency; a few hundred bytes.
