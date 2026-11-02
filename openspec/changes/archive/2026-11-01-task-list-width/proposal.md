## Why

In a window that is not full width, task titles in the Inbox were cut to one line while an empty area stood to the right of them, so some tasks could not be read without opening them (#650). A narrow row (under 40 rem) kept 9 rem free at its end on every row, at all times, for the hover actions, and cut its title to one line before it. Zooming out to see more made it worse: from 1024 px the Inbox keeps a "No task selected" pane beside the list even with nothing selected, and at 1100 px the titles had about 90 px left. The owner also found the row bulky on hover.

## What Changes

- A list row's title uses the width the row leaves it, wraps onto a second line, and ends with an ellipsis after two lines. The whole title is the open control's name, the tooltip while the title is cut, and in the task panel. On a very wide row the title wraps at a readable measure (48 rem). The metadata line is unchanged; in the one-line layout the property column stays on the title's first line. The phone row stays one line.
- No room is kept for the revealed row actions: on a narrow row they float over the end of the row, as they already do on a one-line row. Revealing them changes nothing in the row's layout or height.
- The Inbox's own split shows its empty "No task selected" pane only from 1440 px. Between 1024 and 1440 px the Inbox is a full-width list until a task is under the cursor, which shows in the pane beside it as before; clearing the cursor removes the pane again. The side panel preference keeps its empty pane as before, since the user opens and closes that panel.

Out of scope: the phone row (one line by design), the width of the docked pane, the side panel's rules, board cards and the compact rows of Plan. Advances no ROADMAP.md item; a fix for #650.

## Capabilities

### New Capabilities

### Modified Capabilities
- `task-list-presentation`: titles take two lines and the row's width; no room kept for the revealed actions at any width.
- `inbox-triage`: the Inbox's empty pane only with room for it (from 1440 px).

## Impact

`web/src/app/TaskRow.tsx`, `web/src/index.css`, `web/src/ui/useOverflowing.ts` (one shared ResizeObserver for cut text), `web/src/app/panel.ts` and `web/src/app/PanelHost.tsx`, stories and their visual baselines. No data, op, API, dependency or setting changes; works offline as before.
