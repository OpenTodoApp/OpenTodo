# Touch title editing

## Why

Issue #1554: on an iPhone or an iPad, editing a task's or a subtask's title from the list should keep the person in the list. Version 1.7.0 (`click-selects-title` D8) shipped most of this: a short left swipe opens a compact editor in the row with Save and Cancel, and the row menu offers the same editor. Four gaps remain:

- The swipe works only below 768 px, so an iPad held by touch can reach the editor only through the menu.
- The keyboard's return key does not say Done.
- iOS does not blur a field when the tap lands on a part of the page that takes no focus, so a tap outside the editor did not reliably save it. When it did blur, the same tap also opened the row it landed on.
- Save and Cancel sit under the field and could stay behind the keyboard.

The owner decided on the issue: a tap keeps opening the task, the short swipe works on touch at any width, and a tap outside the editor saves it, as a click away does on desktop.

## What Changes

- **Any width on touch.** The short left swipe (48 px up to 96 px) edits the title on every touch screen, the iPad included. The full swipe still opens Schedule. A fine pointer never swipes, as before.
- **Return says Done** in the compact editor, and Return saves.
- **A tap outside saves.** A tap that starts outside the compact editor and outside its pickers saves the title and ends the edit. That tap does nothing else: it does not open, tick or expand the row it lands on. A press that moves (a scroll, a swipe) leaves the editor open. Cancel still discards the change.
- **Above the keyboard.** While the keyboard is open, the whole compact editor stays in view, with Save and Cancel.
- **Subtasks** edit like their parents.

No op field, route, setting, shortcut or dependency. Not **BREAKING**.

## Out of scope

- A tap that edits instead of opening. The owner kept tap to open.
- The full-width editor with its edit bar on touch. The desktop inline editor and its rules do not change.
- Swipes on board cards, in Plan and on timelines.

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: a new requirement, "Touch title editing".

## Impact

- Web:
  - `web/src/app/TaskListView.tsx`: the short swipe no longer depends on the width.
  - `web/src/app/task-list/InlineEditor.tsx`, `web/src/app/TitleField.tsx`: `enterKeyHint`.
  - `web/src/app/task-list/tapOutside.ts`: the tap outside.
  - `web/src/app/rowSwipe.ts`: `swallowClick` gets a window.
  - `web/src/ui/overlay/stack.ts`: keeps the compact editor above the keyboard.
- Docs: `docs/task-panel.md`; `changelog.d/Changed/touch-title-editing.md`.
- Size: a few hundred bytes, within the first-load budget.
