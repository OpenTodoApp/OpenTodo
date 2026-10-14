# Design

## Context

See proposal.md (Why) for the motivation. Current state:

- **Four `<Menu>` call sites build their items by hand.**
  - `ViewMenu` in `web/src/app/ViewsView.tsx:15`, reused by `Sidebar.tsx:233`, `SavedViewView.tsx:127` and `DashboardView.tsx:104`
  - `LabelMenu` in `LabelsView.tsx:96`
  - the section menu in `Sections.tsx:66`
  - the project menu in `ProjectHeader.tsx:119`
  
  Every item is a `btn-ghost w-full justify-start` button. "Move up"/"Move down" sit side by side in a `flex` row, and "Merge into…" and "Move to" are native `<select>`s inside the popover.
- **`app/overlay/Menu.tsx` is a trigger plus a `Popover`** with `aria-haspopup="dialog"`. There is no menu role, roving focus or type-ahead; Tab moves through the buttons.
- **`Popover` already supports `role="menu"`** and turns into a bottom sheet below 640 px.
- **Five destructive flows here use native `confirm()`:** `LabelsView.tsx:96,103`, `ViewsView.tsx:20`, `Sections.tsx:36`, `ProjectHeader.tsx:83`. `overlay/Dialog` already supports `role="alertdialog"` and `dismissable={false}`.
- **Triggers use `.hover-reveal`** (`index.css:117`). It is already visible on focus-visible, focus-within, `aria-expanded` and devices without hover. But it is keyed to the trigger itself, not to focus elsewhere in its row.
- **`lib/labels.ts`:**
  - `reorderLabel` swaps the positions of two labels, writing two ops.
  - `LABEL_PALETTE` has 9 hex colours.
  - `updateLabel` already validates empty names and duplicate names (`LabelExistsError`).
  - Labels are stored with a free hex `color`.
- **`scripts/e2e-layout.mjs`** already opens these overlays: `label-menu`, `view-menu`, `sidebar-view-menu`, `view-header-menu`, `section-menu`, `project-menu`.

Dependencies:
- **`design-language`** provides the tokens, the 12-hue palette with solid and soft steps, and the mapping of stored hex colours to palette hues.
- **`ui-primitives`** provides `Icon`, `Button` (with an icon-only variant), the menu primitives (`MenuItem`, `MenuGroup`, `MenuSeparator`, menu semantics on `overlay/Menu`), the `Combobox`, `Badge` and `EmptyState`.
- The generic menu keyboard pattern and picker matching are specified once in `design-system` (by `ui-primitives`). The `action-menus` capability here specifies only app-level behaviour on top of them.

## Goals / Non-Goals

**Goals:**
- One declarative way to describe an action menu, so the four menus, and future ones, cannot drift apart.
- Zero native `confirm()` and zero native `<select>` inside these menus.
- The labels page reads as a list you manage, not as a popover you discover.
- No new op, field or API. Every write goes through the existing `lib/labels`, `lib/views`, `lib/sections` and `lib/projects` functions and therefore through `mutate()`.

**Non-Goals:**
- Changing the generic menu primitive's keyboard behaviour (owned by `ui-primitives`).
- Right-click context menus. Task rows and the task context menu are a later task-list change.
- Reworking the project colour picker beyond moving it into the new menu layout.

## Decisions

### 1. Menus are described as data, rendered by one `ActionMenu`

A small `ActionMenu` component in `web/src/app/menus/` takes `groups: ActionGroup[]`. Each group holds items of these kinds:

- `action`: `id`, `icon`, `label`, optional `shortcut`, `disabled` with a `reason`, `tone: 'danger'`
- `check`: like `action` plus `checked`
- `picker`: opens a Combobox step
- `confirm`: opens an impact dialog

It renders `MenuGroup`/`MenuItem`/`MenuSeparator` from `ui-primitives` inside `overlay/Menu`. Each object owns a hook that builds its groups:

- `useViewMenu(view)` (replaces `ViewMenu`)
- `useLabelMenu(label)`
- `useSectionMenu(section)`
- `useProjectMenu(project)`

Rendering and testing then become uniform: a unit test asserts each hook's groups (order, danger last, disabled reasons), and one component test covers `ActionMenu`.

*Alternative:* hand-compose `MenuItem`s in each file. That is simpler at first, but it keeps four places where order, icons and confirm logic can drift, and it is exactly what produced today's inconsistency.

### 2. Picker and confirm are steps inside the same overlay

Choosing a `picker` item swaps the menu content for a `Combobox` with a back affordance (← icon button, and Escape) in the same `Popover`. The overlay stays anchored, the sheet on phones keeps its title, and focus never jumps to a second floating layer. Picking a target leads to the confirm step.

Confirmations use a separate `overlay/Dialog` with `role="alertdialog"` and `dismissable={false}`, because the spec requires it to be modal and not dismissed by an outside tap. The menu closes first, and when the dialog closes, focus returns to the menu trigger.

A shared `useConfirm()` hook builds the dialog from `{ title, body, confirmLabel, tone, impact }`. Its initial focus is on Cancel.

*Alternative:* nested popovers (a submenu flyout). They are fragile on phones and in the bottom sheet, and they make a second focus trap. Rejected.

### 3. Impact counts come from local data at open time

New pure helpers count what a destructive action will touch, from Dexie:

- `labelUsage(id)`: non-deleted tasks whose `labels` contain the id, the same set `deleteLabel` rewrites
- `sectionOpenCount(id)` (already in the section heading)
- `projectImpact(id)`: open tasks and sub-projects

They run offline and may be stale by one sync, which is acceptable: the dialog states counts "now on this device", and the op batch is computed again when the user confirms.

### 4. Single-op reorder for labels, on the shared ordering helpers

`reorderLabel` today swaps two positions and writes two ops. It becomes a thin wrapper over `lib/ordering.ts`, the arithmetic the `manual-ordering` capability already uses for tasks, sections and projects:

- `planStep` handles Alt+↑/↓, and Alt+Shift+↑/↓ for top and bottom, matching the existing project and task conventions (`Sidebar.tsx:160`, `TaskListView.tsx:438`).
- `planMove` handles drag (`{ before | after: id }`).
- The planned changes are written in one `mutateMany()` call.

An ordinary move is one op. `renumber` touches more labels only when `needsRenumber` finds no gap, which is exactly the spec wording. Ties fall back to the shared order rule (position, then id), which is total on every device. Positions are already numbers on the label entity, so there is no data model change, and concurrent moves converge by per-field LWW.

*Alternative:* keep swapping. It writes two ops per step, and a drag across N rows needs N swaps.

### 5. Drag and drop with native pointer events

Drag reuses the pattern of `listDrop.ts` / `calendarDrag.ts`: pointer events, a drop indicator, and auto-scroll in the sidebar. No new dependency. On touch devices, drag starts from a visible handle after a long press, so scrolling the list isn't hijacked. Keyboard reorder is the accessible path, and a live region announces "errand moved to position 2 of 9".

### 6. Trigger visibility keyed to the row

`.hover-reveal` gains a row-level rule: `.group:focus-within .hover-reveal` and `.group[data-active] .hover-reveal` (the active row; `aria-selected` is not valid on a plain row) show the trigger. The existing no-hover media query keeps triggers always visible on touch.

The trigger becomes `Button` icon-only (the `more-horizontal` icon), sized by `touch-target`, with the accessible names already in use ("Menu for label errand"). That keeps the e2e selectors stable.

### 7. Keyboard entry to the menu

The rows of the labels overview, views overview and sidebar groups, plus section headings, are already focusable buttons. A small `useRowMenuShortcut(ref, open)` handles `.`, `Shift+F10` and the `ContextMenu` key on the focused row, and does nothing inside text fields.

`.` is currently unbound: checked against the `?` help, the vim map in `app/vim/` and the global shortcuts. It is added to `docs/keyboard.md` and to the help overlay. `F2` (rename) and `Alt+↑/↓` / `Alt+Shift+↑/↓` (reorder, the same keys as projects and tasks) are row-scoped in the same hook.

### 8. Labels page layout

```
+----------------------------------------------------------+
| Labels  9                                 [+ New label]  |
|  ! 2 labels share a name ("Errand", "errand")  [Merge…]  |
+----------------------------------------------------------+
| ::  (o) errand                       3        [...]      |
| ::  (o) home                                  [...]      |
| ::  (o) work                12   [dup]        [...]      |
+----------------------------------------------------------+
  :: drag handle (visible on hover/focus, always on touch)
  (o) colour chip in the label's soft and solid palette steps
```

The edit panel is a `Popover` (an anchored panel of about 20rem, or a bottom sheet) with three sections:

- **Appearance:** name field and the 12-swatch grid with radio semantics (`role="radiogroup"`, arrow keys move between swatches)
- **Organize:** Move up / Move down, with their shortcut hints
- **Danger zone:** "Merge into…" (picker step) and "Delete label…" (confirm)

The panel is the menu's richer sibling. The row menu has Edit…, Rename, Move up, Move down, Merge into… and Delete, so a keyboard user can do everything from the menu without the panel.

Colours: the swatches write the palette's solid hex value into the existing `color` field. Existing labels whose stored hex isn't one of the 12 still render through `design-language`'s nearest-hue mapping, and the panel marks that hue as current. Nothing is rewritten until the user picks.

### 9. Icons used (from the `ui-primitives` set)

| Icon | Meaning |
|---|---|
| `more-horizontal` | trigger |
| `pencil` | rename |
| `palette` | edit |
| `pin` | pinned |
| `home` | start view |
| `arrow-up` / `arrow-down` | move |
| `folder-input` | move to |
| `merge` | merge |
| `archive` | archive |
| `trash-2` | delete |
| `grip-vertical` | drag handle |

If one is missing from the vendored set, `ui-primitives`' process for adding an icon applies. This change adds no other icon source.

## Data model impact

None. No new entity, field or op type. The `label.position`, `label.color`, `view.pinned`, `section.position` and `project.parent_id` fields are written exactly as today. Single-op label reorder writes one `position` per move instead of two. The op schema, `internal/sync/ops.go`, `web/src/lib/types.ts` and the E2EE content field lists don't change.

## Size and runtime impact

- **No new dependency.** Container image and Go binary only change by the embedded web assets.
- **Expected bundle change:** about −1 to +2 KB gzipped. Duplicated menu and picker markup is removed, and `ActionMenu`, `useConfirm` and the drag helper are added. Measured (`vite build`, every JS and CSS asset gzipped at level 9, against `feat/screen-token-migration`): 584,630 → 589,190 bytes, **+4.6 KB gzipped (+0.8%)**. That is above the estimate: the label edit panel, drag-reorder with auto-scroll and the duplicate banner are new UI rather than replacements.
- **Runtime memory:** unchanged.

## Risks / Trade-offs

- **Keyboard muscle memory:** users who Tab through menu buttons will now meet roving focus. → Arrow keys, Home/End and type-ahead follow the platform norm, the `?` help documents them, and Tab still leaves the menu, closing it.
- **Stale impact counts across devices:** a count can be off when another device changes tasks during the dialog. → The dialog wording is "on this device"; the rewrite is computed again at confirm time, so no task is missed.
- **Drag on touch fighting scroll.** → Handle-only long-press drag. Keyboard reorder and the menu are the accessible alternatives.
- **e2e layout selectors break:** `scripts/e2e-layout.mjs` targets buttons by name. → Trigger names stay. Item names change from "Unpin from sidebar" to the checkable "Pinned to sidebar", so the script and the screenshot fixtures are updated in the same task.
- **Order of landing:** this change assumes `ui-primitives` has merged. → Tasks start with a check that the primitives exist, and the change must not be applied before.

## Migration Plan

This is a client-only change, shipped with the next release. There is no data migration, and rollback is simply reverting the commit, because no stored data changes shape. Label colours chosen from the new palette are ordinary hex values that older clients render as-is.

## Open Questions

- Should the project colour swatches also move into an "Edit project…" panel for symmetry with labels? It can be decided while implementing without changing the specs. The default is to keep the swatches in the project menu's first group.
