# Undo a project's name, colour and icon

## Why

#1748 (justinsteven) asks for more changes to be steps of the undo history, renaming among them. A project's rename, colour and icon wrote straight through `updateProject`, so Ctrl/Cmd+Z did nothing after them.

## What Changes

- `projectEditUndoable` and `projectRenameUndoable` (`web/src/lib/undoActions.ts`) record one step. A rename is named "Renamed “{from}” → “{to}”" (each name clipped to 50 characters, as a task's rename is), a colour "Colour {name}" and an icon "Project updated". All three strings already exist in every locale. No toast.
- The menus' rename, icon and colour (`projectAppearance.tsx`) and the command palette's rename and colours use them. A value the project already has records nothing.

## Out of scope

- A project's move, archive, flow and review cadence (they have their own paths), and its list mode switches.

No new field, no new string, no op-log or API change, no new environment variable.
