# Proposal

## Why

Every "⋯" menu in the app (views, labels, sections, the project menu) hand-builds its items as full-width ghost buttons with long text labels ("Set as start view on this device", "Move up" / "Move down" side by side, a native `<select>` for "Merge into…" and "Move to"). Each destructive action ends in a browser `confirm()`. Users find these menus usable but dated and hard to scan. The labels page is the worst case: everything a user needs to manage labels is there, but it is packed into one popover that only appears on hover. With the `design-language` tokens and the `ui-primitives` components (MenuItem, Combobox, confirm Dialog, Icon) available, these surfaces can move to one modern, keyboard-first menu language and a properly laid-out labels page.

## What Changes

- **One menu language for every action menu.**
  - Every row is an icon plus a short verb label, with a shortcut hint where one exists.
  - Items are grouped with separators. Destructive items always come last and use the danger tone.
  - State is shown with a check or switch instead of rewording the label ("Pinned ✓" rather than "Unpin from sidebar").
  - Menus follow the WAI-ARIA menu pattern: `role="menu"`, `menuitem` / `menuitemcheckbox`, roving focus, arrow keys, Home/End, type-ahead.
  - Applies to the view menu (sidebar, views overview, view header, dashboard), the label menu, the section menu and the project menu.
- **Picking a target inside a menu uses a searchable picker.** "Move to" (project) and "Merge into" (label) open a Combobox step inside the same overlay instead of a native `<select>`.
- **Destructive confirmations use the app's Dialog.** Deleting a view, label, section or project, and merging labels, show an `alertdialog` that states the impact ("Removed from 12 tasks"), names the action on the confirm button, and puts focus on Cancel. Native `confirm()` goes away from these four menus.
- **Triggers you can find.** The "⋯" trigger is an icon-only button with an accessible name. It stays visible on the selected/active row, on keyboard focus within the row, while its menu is open, and always on touch devices. On hover-capable pointers it may still fade in on hover elsewhere.
- **Labels page redesign** (`g l`):
  - Roomy rows: color chip, name, open-task count, duplicate badge, and a visible menu trigger on focus.
  - An edit panel (popover on wide screens, sheet on phones) with three sections:
    - Appearance: name and color, with a 12-hue palette from the design tokens and the current color marked.
    - Organize: reorder.
    - Danger zone: merge and delete.
  - Inline rename (double-click, `F2`, or "Rename"), reorder by drag and by keyboard (`Alt+↑/↓`), a helpful empty state, and the duplicate-name banner pointing to a one-click "Merge…" action.
- **Every action reachable without a mouse.** Each menu opens from its trigger and, for the selected label, view or section row, with a shortcut (`.` or `Shift+F10` / the context-menu key).

No data model change and no op schema change: every action keeps using the existing label, view, section and project operations.

## Capabilities

### New Capabilities
- `action-menus`: How contextual action menus behave and present their items across the app. Covers structure (icons, groups, danger last, state indicators), the ARIA menu keyboard pattern, discoverable triggers, in-menu target pickers, and impact-stating destructive confirmations.

### Modified Capabilities
- `labels`: "Delete a label" and "Merge labels" now require an impact-stating confirmation, and merge uses a searchable target picker. New requirements cover the redesigned overview page, the label edit panel, inline rename, and reordering by drag and keyboard.
- `custom-views`: A new "View menu actions" requirement defines one view menu used everywhere. Pin and start view become checkable items, and delete needs a confirmation dialog.
- `sections-and-boards`: "Section lifecycle" now requires that deleting a section from its menu is confirmed in a dialog stating how many open tasks move.
- `project-organization`: "Move a project" changes the picker from a native select to a searchable picker that keeps the existing exclusions.

## Impact

- **Code:**
  - `web/src/app/LabelsView.tsx` (rewritten row and edit panel)
  - `web/src/app/ViewsView.tsx` (`ViewMenu`)
  - `web/src/app/Sections.tsx` (section menu)
  - `web/src/app/ProjectHeader.tsx` (project menu, Move to)
  - `web/src/app/Sidebar.tsx` (triggers)
  - `web/src/app/overlay/Menu.tsx` gets a real menu role and roving focus, or wraps `ui-primitives`' MenuItem/MenuGroup
  - `web/src/lib/labels.ts` (usage count helper; reorder rebuilt on `lib/ordering.ts`)
- **Tests:** vitest component tests for keyboard navigation and confirm dialogs. `scripts/e2e-layout.mjs` overlays `label-menu`, `view-menu`, `sidebar-view-menu`, `view-header-menu`, `section-menu` and `project-menu` get updated selectors, plus a new `label-edit` overlay and a confirmation-dialog overlay.
- **Docs:** `docs/labels-and-filters.md`, `docs/views.md`, `docs/sections-and-boards.md`, `docs/keyboard.md` (new menu shortcut), and regenerated screenshots.
- **Dependencies:** none new. Builds on `design-language` (tokens, 12-hue palette) and `ui-primitives` (Icon, Button, MenuItem/MenuGroup/MenuSeparator, Combobox, confirm Dialog, Badge, EmptyState). This change must land after both.
- **Bundle:** expected neutral to slightly smaller, since duplicated menu markup collapses into shared components.
- **API / server:** no change. No new environment variables, no op log change. Nothing is **BREAKING**.

## Out of scope

- The task row context menu and task list density (a later task-list change).
- Settings panels and their `window.confirm()` calls (`settings-redesign`).
- Task detail pickers (`task-detail-redesign`).
- The comment delete confirmation in `TaskConversation.tsx` (`task-detail-redesign`).
- Project color palette changes beyond reusing the menu language.
- New label features (label groups, label descriptions, nested labels).
- Right-click context menus on pointer devices. The keyboard shortcut covers the need; right-click can follow later.

## Roadmap

No existing ROADMAP.md item covers this. It advances the new **design refresh** track opened by `design-language` and `ui-primitives`. That track's row in ROADMAP.md ("Future ideas" until shipped) lists `labels-and-menus` alongside `settings-redesign` and `task-detail-redesign`.
