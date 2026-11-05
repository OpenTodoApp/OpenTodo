# Design

## Context

See proposal.md. Saved views and board columns hand a `RuleDraft` to the routine editor through `openRoutineDraft` (`web/src/app/routines/routineNav.ts`); the editor already supports the `task.moved` trigger with a project and an optional section. The sidebar's new-project form (`Sidebar.tsx`) already has a Parent project field and starts with the open project as the parent. `SubProjects` renders above the list in List layout and was left out of Board layout.

## Decisions

### D1: A section's draft is a trigger and nothing else

`ruleDraftFromSection` returns `{name: section.name, trigger: {kind: 'task.moved', project_id, section_id}, condition: null, actions: {}}`. The user chooses what the rule does; guessing an action from the section's name would be wrong more often than right. The item sits in its own menu group after Rename, Colour, Icon and Flow, with the `zap` icon and the existing "Make an automation rule" label, so the three entry points read the same. "No section" has no section menu, so it has no item (a `task.moved` trigger without a section means "into the project", not "out of every section").

### D2: Hidden where the server runs no rules

`GET /api/v1/me` reports `automations: {enabled, paused}`; `enabled` is the owner's switch and is false on a demo instance. `lib/rules/automationsOn.ts` reads it when sync starts (beside the maps switch and the kept-away projects) and after the owner changes the switch, remembers it in device storage and serves it from a module store, so the menus render the same offline and without a flash. Unknown reads as off. All three entry points use it, not only the new one, so the rule is one rule. A user's own Pause all does not hide the item: their rules can still be made and resumed. Roles: the section item is part of the section menu, which only editors and up get; a viewer's column menu keeps only Fold column.

### D3: New sub-project reuses the sidebar's form through a signal

`newSubProject` (a channel in `signals.ts`, like `sidebarFind`) carries the parent id. The Shell expands the icon rail and opens the phone drawer; the Sidebar opens its new-project form with that parent (taking a request left before it mounted). No new form, no dialog: the form is the one the **+** opens, and Create opens the new project as before. The item is offered to the owner and admins (the roles that may move the project), in the group with Move to; the command palette's project commands list it too through `projectMenuGroups`.

### D4: Sub-projects stay above a board's columns

The same `SubProjects` component renders in Board layout at the same place as in List layout: under the header and the project note, above the columns. Below the columns was considered: columns grow with their cards, so the group would land off screen on a full board and move as cards are added. Above, it is one collapsible header (collapsed state per device, shared with List layout) and the board's columns follow; on a phone it sits above the paged column.

## Interface budget

No new chrome row: the group is the one List layout already shows, collapsible, and absent for a project without sub-projects. Two menu items, no new shortcut, no new scroll region.

## Size

A few hundred bytes in modules already in the first load. No dependency, no server change.
