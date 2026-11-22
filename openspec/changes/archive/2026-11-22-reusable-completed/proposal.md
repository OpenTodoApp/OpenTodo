# A reusable list's ticked items are under Completed

## Why

A reusable grocery list ended with "Got it 28". "Got it" reads as an acknowledgement (the assistant's disclosure notice uses the same words for that), and it says something about a shopping trip that isn't true of every reusable list, such as a packing list or a weekly dinner plan. Every other project calls the same group "Completed".

## What Changes

- A reusable list's completed group is headed **Completed**, with the same count and screen-reader name ("28 completed tasks") as any project's.
- Everything else about the group is unchanged: always shown, whatever the device preference; closed by default; newest first; unticking reopens.
- The "Got it" (list) and "items ticked off" messages are removed from every catalogue.

No new op field, setting, route or dependency. Not **BREAKING**.

## Out of scope

- The docs screenshot of a reusable list (`docs/images/reusable-list-*.webp`), which shows the old heading until `make docs-screenshots` is next run.

ROADMAP.md: none (follows `reusable-lists`).

## Capabilities

### Modified Capabilities

- `reusable-lists`: "Ticked items stay in a reusable list" names the group Completed.
- `task-list-presentation`: "Completed group in a project" drops the "Got it" heading.

## Impact

- Web: `web/src/app/task-list/ListGroups.tsx` (one header for every project), `TaskListView.tsx`, `task-list/useListModel.ts`; the catalogues.
- Docs: `docs/reusable-lists.md`, `docs/completed-in-projects.md`, `docs/reusable-list-aisles.md`; `changelog.d/Changed/reusable-completed.md`.
