# Proposal

## Why

The owner's goal (2026-11-26) is the whole app in the phone UI. A reading of every remaining screen for what a finger cannot do found a first group of plain defects, each small, on screens a phone already lays out well:

- **Updates:** a row is selected by a tap and opened only by a double click, which a phone does not have. The title and the project inside the row do open; the rest of the row does nothing useful.
- **Habits:** the menu with the other ways to check in, and the pencil that edits a check-in's note, are drawn only while a mouse hovers. By touch they are there but cannot be seen.
- **A project's Timeline:** moving the range earlier or later and back to today is done with the keys `[`, `]` and `t` only. A phone has no control for it.
- **Labels:** the handle that reorders a label is 12 px wide.

## What Changes

- **Updates: by touch, a tap on a row opens what it is about** (the task, or the project when the entry has no task). With a mouse nothing changes: a click selects, a double click opens.
- **Habits: the check-in menu and the pencil are visible on a device whose main pointer is coarse.**
- **Timeline: Earlier, Today and Later as buttons** beside Days and Weeks, on every device; the keys stay.
- **Labels: the reorder handle is 44 px tall and wider by touch.** Styling only, no requirement.

Out of scope: the Timeline's bars and their 6 px handles, a Board's cards, Process the Inbox, facts that live only in a tooltip (each its own change); anything with a mouse.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `activity-feed`: a tap opens a row by touch.
- `habits`: the check-in controls are visible by touch.
- `project-timeline`: the range has visible controls.

## Impact

- Changed: `web/src/app/FeedView.tsx`, `web/src/app/habits/HabitRow.tsx`, `web/src/app/habits/CheckIns.tsx`, `web/src/app/TimelineView.tsx`, `web/src/app/LabelsView.tsx`; tests beside them.
- No new string (Earlier, Later, Today and Range exist), no op field, no route, no server change, no environment variable, no dependency.
