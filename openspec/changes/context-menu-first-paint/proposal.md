## Why

A task's right-click menu was not drawn at once: it first showed a shorter list at one place, and a frame later the rest of its items appeared and the menu jumped to another place (#840, also seen in the recording of #839). The menu mounts when it opens and only then reads the right-clicked task and the account state its items depend on, so its first paint had none of the one task's own items (Add to focus, Start tracking, Start focus, the slot, Energy, Day part). When the read landed the list grew, and the overlay placed the taller panel again.

## What Changes

- A task's actions menu (right-click, touch hold, the row's More button, the keyboard's `.` and the Selection bar's Actions) opens once the reads its items depend on have landed, so its first paint holds every item and it is placed once. The reads are local (IndexedDB) and take a few milliseconds; nothing else changes in the menu.
- Once shown, the menu stays open while a later read for another selection runs.

Out of scope: #839 (Move to project) and #841 (a menu appearing after a bulk action). Advances no ROADMAP.md item; a fix for #840.

## Capabilities

### New Capabilities

### Modified Capabilities
- `action-menus`: a task's actions menu opens complete and in its final place.

## Impact

`web/src/app/menus/ActionMenu.tsx` (a `pending` prop that holds the panel back), `web/src/app/bulk/BulkActions.tsx` (the menu's data says when it is ready), `web/src/lib/localData.ts` (`useLabelsLoaded`). No data, op, API, dependency or setting changes; no shared `web/src/ui` component changes. Bundle: a few dozen bytes.
