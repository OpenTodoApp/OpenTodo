# Proposal

## Why

Wide task lists can be hard to scan when the title and its properties sit far apart or a row spans several lines. A subtle line between task groups helps readers follow each group across the list. [#1089, row separators](https://github.com/OpenTodoApp/OpenTodo/issues/1089#issuecomment-6846511685)

## What Changes

- Show a soft hairline between top-level task groups in wide One line and Detailed lists. An expanded parent and all of its visible descendants form one group.
- Apply the treatment in the main task lists, including built-in views, projects, labels, and saved and ad hoc filters. Keep the treatment off on phones and in narrow panes.
- Board cards, embedded task lists, task details, print, and new Appearance settings are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: Add separators between top-level task groups in wide list layouts.

## Impact

This advances the `UX polish (2026-11 feedback)` roadmap milestone, following `sidebar-brand-and-row-grid` and the other #1089 follow-ups. The change affects list rendering, shared row styling, the row layout guide, and visual baselines. No data model, API, or dependency changes.
