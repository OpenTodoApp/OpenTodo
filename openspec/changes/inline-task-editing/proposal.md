# Proposal

## Why

User feedback, October 2026, on task lists:

1. **"Think about letting edit the title of the task in the main section, where I see the task. Maybe with an extra click or extra shortcut it opens the sidebar on the right. Like an inline edit plus a simplified contextual form near the task, and on demand open the right panel."** Today every click on a row opens the task panel. Renaming a task, or giving it a date, means a 416 px panel appearing, the list shrinking from about 830 to 545 px, and the eye moving to the right edge. The panel is right for notes, subtasks and the conversation, and too much for "fix the typo, make it tomorrow".
2. **"If I click on a task it selects it, highlights it and the sidebar appears. It's hard to unselect it. Maybe clicking anywhere except on the sidebar should unselect it. And the highlight is ugly, the whole background isn't nice."** The only ways to clear a selection are Esc (undiscoverable with the mouse) or clicking another row. A click on the empty part of the list does nothing. The selected row is drawn with a sunken background and a 1 px accent ring all around (`TaskRow.tsx`), which reads as a form field rather than a cursor, and the ring is close to the row's neighbours.

## What Changes

- **Click edits in place.** On a fine pointer from 768 px, clicking a row's title selects the row and turns it into an inline editor: the title becomes a text field with the caret where the user clicked, and a contextual bar appears under it with the four most-used properties as compact controls (Date, Priority, Labels, Project) and a Details control. Enter or a click outside saves, Esc cancels the title change, and `Shift+Enter` saves and opens the panel. Tab moves from the title into the bar. The bar's controls open the same popovers as the panel (the date picker of `task-panel-polish`, the label and project pickers) and write the same ops.
- **The panel opens on demand.** Details (in the bar), Enter on a selected row (unchanged), and `Shift+Enter` in the inline editor open the panel. While the panel is open, a click on another row shows that task in the panel, as today, rather than starting an inline edit, so two editors are never open at once. On phones and coarse pointers, a tap still opens the panel as a sheet, since inline editing at 360 px would be cramped.
- **A shortcut to edit in place**: `F2` on the selected row starts the inline editor. It is registered in the registry for the `list` scope, without conflicts.
- **Clicking away clears the selection.** A click on any empty part of the content column (between or below rows, the page margins, the header's empty space) saves and closes an inline editor, clears the selection and closes the panel. Clicks inside the panel, inside an overlay, or on the sidebar's navigation do not clear it, and navigation changes the view as usual. Esc keeps its meaning.
- **A calmer selection.** The selected row loses the ring and the full-row sunken background. It is marked by a 3 px accent bar at its leading edge and a faint accent tint. Keyboard focus keeps the focus outline, ticked rows keep their own tint, and hover stays distinct. The indicator meets non-text contrast (3:1) in both themes.
- **Smart titles inline**: the inline editor is the `TitleField` of `smart-title-tokens`, so `tomorrow p1 #work` typed inline applies as it does in the panel.

No data model, op schema or API change: every inline control writes through `mutate()` exactly what the panel writes. No new environment variable. Not **BREAKING**. The change of click behaviour is a user-visible change of habit, so it ships with a device-local switch, Settings → General → "Click a task to": "Edit in place" (default) or "Open details", for people who prefer the panel.

**Out of scope**: inline editing on board cards, calendar entries and the timeline; notes or subtasks inline; multi-row inline editing; and the panel's own layout (`task-panel-facets`). ROADMAP.md item advanced: none numbered; this answers direct user feedback on the list and continues the design refresh.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: new requirements "Inline title editing", "Contextual edit bar", "Clearing the selection" and "Selected row indicator".
- `web-app`: "Task detail panel" (the panel opens from Details, Enter or `Shift+Enter`, and from a click only on touch, while the panel is open, or with the "Open details" preference). "Keyboard navigation" lists `F2`.
- `keyboard-shortcuts`: no requirement change. The new `list.edit-inline` entry goes through the registry and its conflict test.

## Impact

- **Code**: `web/src/app/TaskRow.tsx` (the inline editor slot, the selection indicator), a new `web/src/app/task-list/InlineEditor.tsx` (`TitleField` and `EditBar`), `web/src/app/TaskListView.tsx` (inline edit state, the click-away handler on the content column, panel opening rules), `web/src/app/task-list/useListShortcuts.ts` (`list.edit-inline`), `web/src/lib/shortcuts.ts`, `web/src/lib/prefs.ts` (the device-local click preference), `PreferencesPanels.tsx`, `index.css` (`.row-selected`), stories `Task/Row` (selected, editing inline) and `Screens/Shell`, the layout check (the inline editor at 768 px), and the docs `docs/tasks-and-projects.md`, `docs/keyboard.md`, `docs/interface-guide.md` (rows and the selection), and the Help pages.
- **Server and API**: none.
- **Dependencies**: none. Expected about +3 KB gzipped in the entry chunk (the inline editor and the bar). The pickers are the existing lazy ones.
- **Interface budget**: no chrome row above lists. The bar exists only under the row being edited and is part of that row. The bar shows 4 properties, within the 7 limit. No new scroller. One new shortcut, `F2`, in the registry.
- **Order**: after `task-panel-polish` (date picker) and `smart-title-tokens` (`TitleField`). Group 1 (selection and click-away) does not depend on them and can land first.
