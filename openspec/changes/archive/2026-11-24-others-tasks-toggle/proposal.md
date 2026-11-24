# Show tasks assigned to others

## Why

GitHub issue #1979: the control for tasks assigned to others did not show whether it was on, so a short list could look incomplete for no visible reason. Since `personal-views-assignee` (#1938) the personal views always leave those tasks out and the control is gone, so there is no way left to see a shared day in Today. One checkable menu item brings the choice back and shows its state.

## What Changes

- The menu of Today, Upcoming, Anytime and Someday offers "Show tasks assigned to others" as a checkable item: unchecked by default, a check while on, announced as checked or not. It is offered only in a shared workspace, and on a phone it is in the bar's overflow.
- While it is on, those four lists also list tasks assigned to others. Counts, the badge, the briefing, Today's limit, Next, the display, the widgets and `today_summary` keep counting the viewer's own work.
- The choice is the existing synced preference `user_prefs.today_assignees`, with a new value `all`; empty, `mine` and unknown values read as off. No new field, op, route or dependency.

## Out of scope

- A marker on the list itself, or a tooltip: the menu item carries the state.
- Showing others' tasks in Next, the counts, the badge or the assistant's summary.
- A workspace-wide policy.

ROADMAP.md: none (an improvement to an existing view option).

## Capabilities

### Modified Capabilities

- `task-assignment`: "Personal views hide tasks assigned to others" gains the option to show them in the lists.
- `web-app`: the standard views name the option.
