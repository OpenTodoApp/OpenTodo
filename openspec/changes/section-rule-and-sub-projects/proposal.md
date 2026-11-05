# Proposal

## Why

Issue #898 asks for four things to make a project page the place a project is run from. Parts 1 (a grouping choice on a project's Board) and 2 (subtask cards on a project's Board) change what a board means and wait for a decision. Parts 3 and 4 were promised on the issue:

- **3.** A column's behaviour (label a task `doing` when it enters *Doing*) needs one hand-built rule per column, written on the Routines page away from the board. Saved filters and board columns already offer **Make an automation rule**; a section does not.
- **4.** Sub-projects cannot be reached from their parent: the only way in is the sidebar's **+** form, which has a Parent project field few people notice, and a project shown as a Board hides its sub-projects entirely.

## What Changes

- A section's ⋯ menu (list heading and board column) gets **Make an automation rule**, opening the routine editor with the trigger "a task is moved into this project and section" filled in, named after the section, with no action yet. Nothing is saved until the user saves.
- Every **Make an automation rule** item (a section's menu, a saved view's menu, a board column's Rule dialog) is shown only while the server runs rules: the owner's automations switch, read from `GET /api/v1/me` and remembered on the device. A demo instance reports it off. The section item follows the section menu's role rule (editors and up).
- A project's ⋯ menu (and the command palette's project commands) gets **New sub-project…** for the owner and admins, opening the sidebar's existing new-project form with that project as the parent; the icon rail expands and the phone drawer opens, as for the sidebar's find.
- A project in Board layout keeps its **Sub-projects** group, in the same place as in List layout: under the header, above the columns.

Part of #898 (parts 1 and 2 are out of scope).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `sections-and-boards`: new requirement "Make a rule from a section".
- `automation-rules`: new requirement "Where rules can be made".
- `project-organization`: "Sub-projects inside a project view" covers every layout with a list or a board; new requirement "New sub-project from a project".

## Impact

- **Code:** `web/src/app/Sections.tsx`, `web/src/app/rules/convertDraft.ts`, `web/src/lib/rules/automationsOn.ts` (new), `web/src/lib/sync.ts`, `web/src/app/ViewsView.tsx`, `web/src/app/RuleEditor.tsx`, `web/src/app/rules/AutomationsSettings.tsx`, `web/src/app/ProjectHeader.tsx`, `web/src/app/palette/registry.ts`, `web/src/app/signals.ts`, `web/src/app/Shell.tsx`, `web/src/app/Sidebar.tsx`, `web/src/app/TaskListView.tsx`, the six catalogues.
- **Data model, ops, sync, API, server:** none. `GET /api/v1/me` already reports `automations.enabled`.
- **Size:** a few hundred bytes in modules already in the first load; no dependency.
- **ROADMAP:** no row; issue #898.
