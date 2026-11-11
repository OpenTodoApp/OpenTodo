## Why

Task rows show a colour dot even when the project has a recognisable icon in the sidebar. Showing the same symbol alongside the project name makes it easier to recognise the project across views. The maintainer agreed to this in [point 3 of #1089](https://github.com/OpenTodoApp/OpenTodo/issues/1089#issuecomment-6726382938).

## What Changes

- When a One line or Detailed task row displays the project, show its configured icon in the project colour. Use the current colour dot when the icon is absent or unavailable.
- Preserve when the project cell appears and what the phone row prioritises.

This refines **Projects, Inbox, Today, Upcoming, Completed** in `ROADMAP.md`. Board cards, project headers, sidebar behaviour, label styling, and project editing and storage are outside this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: use the same project symbol in task rows as in the sidebar.

## Impact

The change reuses the existing project data and lazy icon catalogue. It adds no dependency, setting, API route or data field.
