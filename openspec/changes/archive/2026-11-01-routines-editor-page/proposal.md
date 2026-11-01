## Why

The owner tried the routine editor and found it unusable: "the editor in a modal isn't usable. it must use a page, like the enlarged tasks. Use properly the page, a comfortable and usable UI." The editor from `routines-editor` opens as a wide dialog on a computer. A routine of six or more sentence cards, its test result and its History tab all share one scrolling box, and a run's detail opens as a second dialog on top. A dialog also can't be linked or reloaded, and pressing Escape or clicking outside it can throw away an edit.

## What Changes

- The routine editor becomes a page at `/routines/<id>`, and a new routine opens at `/routines/new`, on the model of the task page (`task-full-page`). The page works from a link and on reload. The `/rules/...` addresses redirect there. A routine started from a view or a board column opens the same page with the draft filled in.
- The page has a sticky header with a breadcrumb (Routines › name) and Back. On a computer the header holds Save, Test and Run now, and an "Unsaved changes" indicator shows when the routine has unsaved edits. On a phone the bar carries Back and the title, and a sticky footer holds the actions.
- From 1024 px the page has two columns. The main column holds the name, the When card and the step cards at a comfortable reading width (44 rem), centred. A secondary column holds the test result, the routine's History and a run's detail, inline, with no dialog on top. Below 1024 px the page is a single column, and tabs (Steps, Test, History) switch between these views.
- Save keeps the user on the page and clears the indicator. Saving a new routine moves the address to its id, and Run now and History become available.
- Leaving with unsaved changes asks first, through the confirm dialog. This covers Back, the breadcrumb, Escape, any in-app navigation and the browser's Back button. Closing or reloading the tab brings up the browser's own prompt.
- `Ctrl+S` also saves, next to `Ctrl+Enter` (save) and `Ctrl+Shift+Enter` (test).
- Focus moves to the page heading when the page opens, and returns to the routine's row on Back.
- A run opened from the Runs tab, the Inbox card or a notification (`/routines/<id>?run=<run>`) shows in the secondary column of the routine's page. The run's address survives a reload.
- The layout check covers the Routines page and the editor page at every width.

Out of scope: any change to steps, previews, the engine, the API or sync. Offline save, keyboard reordering, the step search, the dimmed unavailable steps and undo stay as they are. The Add step sheet and the pickers stay overlays.

ROADMAP: a follow-up to `routines-editor` (1.1 "Routines"), from the owner's feedback. Nothing here is **BREAKING**: no op, field, route or environment variable changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines`: "Sentence-card editor" (a page instead of a dialog), "Test and save" (the result shows in the secondary column, and Save stays on the page), "Routine history and all runs" (History and run detail inline on the page) and "Editor keyboard and accessibility" (`Ctrl+S`, Escape leaves the page, focus). A new requirement, "Routine editor page", covers the addresses, the layout, the leave guard and focus.

## Impact

- Web only. In `web/src/app/routines/`: `RoutinePage.tsx` and `routineNav.ts` are new (`routineNav.ts` holds the pending draft and the row to focus on return). `RoutineEditor.tsx` renders the page layout instead of a `Dialog`, `RunHistory.tsx` splits `RunDetail` into an inline body and a dialog, and `RoutinesView.tsx` navigates instead of opening an overlay. Outside that folder: `router.ts` (`/routines/new`, the query kept on routine pages, a leave guard), `Shell.tsx` (the lazy page), `ViewsView.tsx` and `RuleEditor.tsx` (open the page with a draft) and `lib/shortcuts.ts` (`Ctrl+S`).
- All strings in six languages. Stories and visual baselines change for the routines screens only. The layout check gains two screens.
- No server, sync, op or API change, and no new dependency. The page is part of the lazy routines chunk.
