# A reusable list shows no progress

## Why

A shared grocery list in reusable mode read "60% done" at the start of a shopping trip: everything was ticked off on the last trip, and ten items were added for this one. A reusable list is restocked, never finished, so a share of it done says nothing. An area already shows no progress for the same reason.

## What Changes

- A project in reusable-list mode shows no progress on its page or in its All projects row, as an area doesn't. One rule, `showsProgress` in `web/src/lib/progress.ts`, serves both.
- Its tasks still count in a folded parent's figures, as an area's do.

No new op field, setting, route or dependency. Not **BREAKING**.

## Out of scope

- A setting to hide progress everywhere: a project that finishes keeps a useful figure.
- Task progress (a parent task's share of its subtasks).

ROADMAP.md: none (follows `reusable-lists`).

## Capabilities

### Modified Capabilities

- `project-organization`: "Project progress on the project page" leaves reusable lists out.
- `statistics`: "Areas in project health" says a reusable list shows no progress either, so the All projects cell stays empty.

## Impact

- Web: `web/src/lib/progress.ts`, `web/src/app/ProjectHeader.tsx`, `web/src/lib/projectHealth.ts`.
- Docs: `docs/all-projects.md`, `docs/reusable-lists.md`; `changelog.d/Changed/reusable-no-progress.md`.
- Size: a few lines.
