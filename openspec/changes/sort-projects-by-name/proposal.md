# Sort projects by name

## Why

GitHub issue #1956: a person who numbers client projects in their titles ("0001 Client name") under a "Clients" project wants them in title order without placing each one by hand. The same issue says moving a project up or down by hand "only does it one time". Two causes make a second move look like it did nothing: with several workspaces, a top-level move counted the projects of other workspaces as neighbours, so it stepped over a project the sidebar does not show; and on the All projects page the menu's Alt+Up and Alt+Down did nothing, while its Move up and Move down changed a hidden order when a column header sorted the table.

## What Changes

- "Sort sub-projects by name" in a project's menu (project header, sidebar row, palette) when it has two or more sub-projects, and "Sort by name" in the Projects header menu of the sidebar for the top-level projects. Each sorts once, A to Z in the app's language with numbers by value ("2" before "10", "0002" before "0010"), as one step with Undo. The order stays manual afterwards: new projects still go last, and Move up, Move down and drag still work.
- Project moves count only the projects of the current workspace.
- The All projects page: Alt+Up and Alt+Down (with Shift: to the top or bottom) move the focused row among its siblings and keep focus; while a column header sorts the table, the moves are not offered.

No new mandatory environment variable, no new op field, no new route: the sort writes the existing `position` field.

## Out of scope

- A lasting automatic order ("always sort by name"): new projects would have to be placed by it on every device, and drag would have to turn it off. A one-time sort covers the request with nothing to keep in step.
- Sorting by other keys (creation date, due dates).

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### Modified Capabilities

- `manual-ordering`: a one-time sort by name for projects; project moves follow the projects the list shows.
