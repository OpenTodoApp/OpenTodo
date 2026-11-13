# Proposal

## Why

When tasks are grouped by project, the rows leave out the project because the group names it, but the group headers are neutral, so projects are hard to tell apart in a view with several (issue #1210). A coloured section already tints its header (`section-tint`, #1098).

## What Changes

- **Group by: Project tints each project's header** with the project's colour, using the section tint (the same recipe, measured text tones, every theme): in Today and Upcoming, label pages and saved views (list and board).
- The Inbox's header stays neutral; rows are unchanged.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: project group headers take the project's colour.

## Impact

`web/src/lib/listGroups.ts` (groups carry their project), `web/src/app/task-list/ListGroups.tsx`, `web/src/app/views/ViewResults.tsx`, `web/src/app/SavedViewView.tsx`, `web/src/app/projectHue.ts`; baselines of stories grouped by project.
