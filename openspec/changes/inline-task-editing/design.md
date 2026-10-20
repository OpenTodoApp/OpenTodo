# Design

## Context

- `TaskRow.tsx` renders the title and metadata inside one `button[data-row-open]` whose click opens the panel. Shift or Ctrl/⌘ + click ticks instead. The selected style is `bg-sunken dark:bg-raised ring-1 ring-accent/50` on the `li`.
- `TaskListView.tsx` owns `selectedId` (the cursor) and `openId` (the panel). `onOpen` sets both. `list.escape` closes the panel, then clears the selection.
- The panel is the shell's panel slot (`app-shell`), and the content column is its own scroller.
- `TitleField` comes from `smart-title-tokens`, and `DatePicker` from `task-panel-polish`. `LabelPicker`, `ProjectPickerField` and the priority menu exist and use `Popover`.

## Goals / Non-Goals

**Goals:** rename and re-plan a task without leaving the list; a selection that is easy to see, easy to clear, and calm.

**Non-Goals:** inline notes, inline subtasks, multi-row editing, changing the board or calendar.

## Decisions

### D1. Who opens what on a click
A click on `[data-row-open]` decides as follows:
1. With Shift or Ctrl/⌘, it ticks (unchanged).
2. On a coarse pointer, or below 768 px, or with the preference "Open details", or while the panel is open, it opens or switches the panel (today's behaviour).
3. Otherwise it selects the row and starts the inline editor, with the caret at the click's text offset (`document.caretPositionFromPoint` or `caretRangeFromPoint`, falling back to the end).

The row's button stays a button for keyboard and assistive technology: Enter on it still opens the panel (`list.open`), and `F2` starts the inline editor. The inline mode is announced through the row's accessible description ("Editing, Enter saves, Escape cancels").

### D2. Inline editor state
`TaskListView` holds `inlineId`. The row with `inlineId` renders `InlineEditor` in place of its title and metadata: `TitleField` (single line, the row's typography, the same left edge as the title) and, under it, `EditBar`. Only one row can be inline. Starting another commits the first. Remote changes follow the title draft rule (`web-app` "Title draft survives remote changes"). If the task disappears from the view while edited (completed on another device, moved by a filter), the draft is committed if non-empty and the editor closes.

### D3. The contextual bar
`EditBar` is one row of compact ghost buttons with icon and value (or a muted placeholder): Date (the do-on date in the row's words, opening `DatePicker` on its Do on segment), Priority (P1 to P4 menu), Labels (the `LabelPicker` popover), Project (the project picker), and, at the end, Details (an icon button labelled "Open details", `Shift+Enter`). The bar is 32 px tall and sits within the row's own box, so the rows below move down by one bar height while editing, and back when it closes. Popovers anchor to the bar's controls and do not count as "outside" (see D4). Viewers never get the inline editor. Their click opens the panel as text.

### D4. Click-away
A `pointerdown` listener on the content column's root (not the window) handles clicks whose target is not inside a row (`[data-task-row]`), not inside `[data-overlay]` (popovers, menus, dialogs), not inside the panel slot, and not on an interactive control of the page header (`button, a, input, [role]`). Such a click commits an inline editor, sets `selectedId` and `openId` to null, and does not `preventDefault`, so text selection and focus behave normally. Clicks on the sidebar are outside the content column and are not handled, and navigation clears the selection through the route change as today.

### D5. The selected row
`.row-selected` (in `@layer components`) draws `box-shadow: inset 3px 0 0 var(--color-accent)` and `background: color-mix(in oklab, var(--color-accent) 6%, transparent)` (8 % in dark), with no ring. Hover remains `bg-canvas` and raised in dark, and ticked rows keep `bg-accent-soft`. Keyboard focus keeps `focus-visible:outline`. The inset bar's contrast against the canvas is ≥ 3:1 in both themes, checked by a story and axe. Board cards keep their ring, since they are cards.

### D6. Preference
A device-local preference `opentodo.rowClick` (`edit` | `open`, default `edit`) in Settings → General, next to "Show shortcut hints". It is not synced: habits are per device and per pointer.

## Data model

None. All writes go through `updateTask` and the pickers' existing helpers. Offline, edits apply locally at once and converge per field like any edit.

## Size and resources

About +3 KB gzipped in the entry chunk (`InlineEditor`, `EditBar`). Pickers stay lazy. No dependency.

## Interface budget

- Chrome rows above lists: unchanged.
- Properties visible in the bar: 4 (plus Details), within 7.
- Scroll regions: unchanged.
- Shortcuts: `list.edit-inline` (`F2`, `list` scope), checked by the registry conflict test. `labels.rename` (`F2`, `view` scope of the Labels view, which has no task list) gets an explicit entry in the resolved conflicts if the test flags it. Inside the editor, Enter, `Shift+Enter`, Esc and Tab are local to the field, registered as `local` entries for the cheat sheet.

## Risks / Trade-offs

- [People used to click-to-open] → Enter and Details open the panel, the panel-open state keeps click-to-switch, and the "Open details" preference restores the old behaviour. The Help page and the release notes say so.
- [A click meant to select for keyboard work starts editing] → selecting with `j`/`k` is unchanged, and Esc leaves the editor with the row still selected.
- [Click-away commits an accidental edit] → the title commits only when changed and non-empty, and Undo is offered in the toast as for any title edit.
- [Rows moving when the bar appears] → the bar adds 32 px under one row only, and drag and drop is disabled for the row being edited.

## Migration Plan

Client only. The preference defaults to "Edit in place". Rollback is a client rollback.
