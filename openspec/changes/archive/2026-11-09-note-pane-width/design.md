# Design

## Context

- The docked task's width (`task-side-panel` D3): `PanelResizeHandle` in `web/src/app/sidePanel.tsx` on the panel's left edge (drag, click for the widest and back, ← and → with focus, Home), the width in `localStorage` under `opentodo.taskPanel.width`, set on the root as `--task-panel-w` and bounded by `:root[data-task-split]` in `index.css` (22 rem up to what leaves 38 rem for the sidebar and the list).
- The Notes page docks a standalone note as a custom occupant of the panel slot (`NotePanel` in `PanelFrame`), at the slot's fixed `--panel-w` (26 rem, 30 rem from 1440 px), with the frame's 16 px padding.

## Decisions

**D1. One handle, a store per pane.** `PanelResizeHandle` and `setPanelWidth` take a store (`{ key, cssVar }`): the docked task's by default, `NOTE_PANEL_WIDTH` (`opentodo.notePanel.width`, `--note-panel-w`) for the note. While a note is docked the root carries `data-note-split`, set before paint, and `:root[data-note-split]` reads `--note-panel-w` with the task panel's bounds. `PanelFrame` gains an `edge` slot for the handle. Alternative: a second handle for notes. Rejected: two copies of the same pointer and keyboard behaviour. Alternative: share the task panel's width. Rejected: a note is read and written wider than a task's details, so one width fits neither.

**D2. A writing column.** The note's fields sit in one column, at most 40 rem (about 75 characters of the 15 px note text), centred, with 24 px of padding at least on each side and room below the last line. The default width is about half the content (`clamp(30rem, 46vw, 48rem)`), so at 1280 px the column fills the pane and from about 1500 px it is centred. The task panel is unchanged.

**D3. Phones and narrow windows.** Below 1024 px nothing changes: the note opens as its page and the handle is not shown, as for the task panel.

## Data model

None: the width is a device preference in `localStorage`, never synced, like the task panel's.

## Interface budget

No new chrome row, property, sidebar destination, scroll region or shortcut: the handle is the pane's existing edge, and its keys work only while it has focus, as on the task panel.

## Size

No dependency. A few hundred bytes gzip in the lazy Notes chunk; the first-load budget in `web/bundle-budget.json` is not raised.
