# Unarchive projects in the app

## Why

A project the user archived themselves cannot be brought back from the app. The only way back today is the Undo button on the automatic-archive notice, which disappears with the notice; after that, the user guide has to point people at the REST API and the `archived` field. The behaviour is already specified ("Unarchiving a project SHALL unarchive it alone"), but no screen offers it, so archiving feels like a one-way door and people delete projects instead.

## What Changes

- **Archived projects list** in Settings → Projects, next to the automatic-archive switch: every archived, non-deleted project the user can see, by name, with its parent's name for sub-projects and its open task count.
- **Restore** next to each entry sets the project's existing `archived` field back to `false` through the normal op path (`mutate()`), so it applies at once, works offline and converges on every device under per-field last-writer-wins. It restores that project alone; archived sub-projects stay in the list until restored individually, as the spec already says.
- A project restored from the list is also left alone by automatic archiving on this device, the same rule the notice's Undo already follows, so it does not disappear again the next day.
- Viewers and editors of a shared project see it listed but cannot restore it, matching who can archive.
- The user guides describe the button instead of the API workaround.

## Out of scope

- An "Archived" view in the sidebar or browsing an archived project's tasks without restoring it.
- Bulk restore, or restoring a whole archived subtree in one action.
- Any server, API, op schema or migration change: the `archived` field and its op already exist.
- Changes to automatic archiving rules beyond honouring a manual restore on this device.

## ROADMAP

Completes the "Trash with restore, auto-archive of completed projects" item (`trash-and-history`) and the archive rules of `project-hierarchy`; no new roadmap row.

## Impact

- **Spec:** `project-organization` (one added requirement).
- **Code:** `web/src/lib/archive.ts` (list and restore helpers), `web/src/app/SettingsView.tsx` (Projects section), tests.
- **Docs:** `docs/trash-and-history.md`, `docs/tasks-and-projects.md`, `docs/settings.md`, regenerated docs site and in-app help.
- Nothing **BREAKING**: no new environment variable, no op log format change, no new dependency, no bundle size change beyond a few hundred bytes.
