## Context

`routines-editor` shipped the sentence-card editor as `RoutineEditor`. It is a `Dialog`: full screen on a phone and wide (`xl`) from 640 px, with Steps and History tabs and the run detail as a second dialog. The task page (`task-full-page`) is the model for opening something as a page: its own route, a compact sticky header with a breadcrumb and Back, two columns from 1024 px with a sticky secondary column, and the title in the phone bar.

## Goals / Non-Goals

**Goals:** an editor page that can be linked and reloaded and has room for long routines; the test result, History and run detail shown next to the steps, not over them; the actions always in reach; no lost edits.

**Non-Goals:** changing what the editor edits or how it validates, previews, saves or tests. Pickers and the Add step sheet stay overlays. No server change.

## Decisions

### D1. Addresses

`/routines/new` is a new routine, `/routines/<id>` an existing one, and `/routines/<id>?run=<run>` opens that run in the secondary column. Rule ids are UUIDs, so they cannot clash with `new` or `runs`. `/routines#new`, the earlier address, still parses as a new routine. `/rules/...` keeps redirecting through `canonicalPath`. For routine addresses the router keeps the query in the tracked address (`addressOf`), as it already does for display routes, so a reload keeps the run. The Shell loads `RoutinePage` lazily for a route with `id` or `create` and `RoutinesView` otherwise; both live in the routines chunk.

A draft from a view or a board column (previously opened in `RuleDraftEditor`) is handed over in memory through `routineNav.ts` before the app navigates to `/routines/new`. That file is a few lines, imported by `ViewsView` and `RuleEditor`. If the user reloads that address the draft is gone and the page starts a blank routine, which is the safe outcome. A board's on-drop dialog closes before the page opens.

### D2. Layout

The page uses `PAGE_FRAME`, like the task page.

- **Header** (`PageHeader`, sticky). From 768 px the title is a breadcrumb: *Routines* (a button that goes back) › the routine's name (`aria-current="page"`). Then the actions: the unsaved indicator, Test, Run now (saved routines only), Save (primary) and Help. The indicator is a dot with "Unsaved changes", or "Saved" for a moment after a save, in a `role="status"` region. Below 768 px the shell's bar shows Back ("Routines") and the name. The actions move to a sticky footer at the bottom of the page (`data-routine-actions`), so they stay in reach and are never clipped at 360 px.
- **From 1024 px** the page is a grid of `minmax(0,44rem)` and `22rem` with a gap of 3 rem, centred in the frame. The main column holds the Name field (a large input), then the notices (offline, dropped filter terms, save error, encrypted schedule), then the When card and the step cards. The secondary column (`<aside>` named "Test and history") is sticky under the header and scrolls on its own when it is taller than the screen. It holds two tabs, **Test** and **History** (History for a saved routine only). Test shows a short explanation and the Test button until a result arrives. History lists the routine's runs. Opening a run replaces the list with the run's detail, inline, and a "All runs" link goes back to the list. A run in the address (`?run=`) opens there with History selected.
- **Below 1024 px** the page is one column, with tabs **Steps**, **Test** and **History** under the name. Test and History hold the same content as the secondary column. When a test result arrives, the page switches to the Test tab.

The 44 rem column is the dialog's old content width, so the cards keep their phone-first layout. What changes is mostly the space around them. The page uses only tokens and `web/src/ui` primitives: `PageHeader`, `Tabs`, `Button`, `Field`, `Input`, `Notice`, `EmptyState` and `ConfirmDialog`.

Interface budget: above the first content (the name) there is one row of chrome, the header, and below 1024 px the tab row makes two. A screen has at most three vertical scroll regions: the content, the secondary column and an open sheet. There is no new sidebar destination.

### D3. Save stays on the page, and a new routine gets its address

A page is not a dialog to dismiss. Save writes the ops (offline included), clears the unsaved indicator, shows "Saved" and keeps the undo history. The editor compares against the last saved draft, so saving with no change writes nothing (the "An old rule" scenario). When a new routine is saved, the page replaces `/routines/new` with `/routines/<id>` without remounting the editor: the editor's key is the id the page opened with, which stays the same. Undo and focus survive the save, and Run now and History appear.

### D4. The leave guard

`router.ts` gains `setLeaveGuard(fn | null)`. While the editor has unsaved changes it installs a guard, and `navigate()` asks the guard first. The guard opens the existing `ConfirmDialog` ("Discard your changes?", "The routine stays as it was saved.", Discard) and returns true to say it has taken over. Discard clears the guard and goes on with the navigation.

The browser's Back (`popstate`) has already changed the address by the time the router hears of it. The router pushes the editor's address back and asks the guard; Discard then calls `history.back()` with the guard cleared. Closing or reloading the tab raises `beforeunload`, the browser's own prompt. Back, the breadcrumb and Escape all go through `navigate`, so they ask too. The guard is removed when the draft is clean again or the page unmounts.

### D5. Keys and focus

The editor's own key handler keeps `Ctrl+Enter` (save) and `Ctrl+Shift+Enter` (test) and adds `Ctrl/⌘+S` for save. The handler calls `preventDefault`, so the browser's "Save page" dialog never opens. The registry entry `routines.save` lists `Ctrl+S` as well, and the conflict test covers it; no global shortcut uses `Ctrl+S`. Escape goes back to the list, except when it comes from an overlay (a picker, the sheet, a dialog), which keeps its own Escape. The task page uses the same check.

When the page opens, focus goes to the page heading (`titleRef`, `tabIndex=-1`). When the user leaves by Back, `routineNav.ts` records the routine's id, and the Routines page focuses that row's edit button when it mounts (`[data-rule-row=<id>] [data-edit-routine]`). For a routine saved for the first time, this is its new id.

Landmarks: the page sits in the shell's `main`. The header is the page's `header`, the steps are a `section` named after the routine, and the secondary column is an `aside`.

### D6. Run detail inline

`RunDetail` is split into `RunDetailBody` (the content) and `RunDetail` (the same body in a `Dialog`). The dialog stays for a run whose routine has been deleted. The Runs tab of the Routines page opens a run of a live routine by navigating to `/routines/<id>?run=<run>`. The Inbox card and notifications already link that address.

## Data model

None: no op, field, migration or route.

## Size

No new dependency. The page code joins the lazy routines chunk. The first load gains only the router guard and `routineNav.ts`, a few hundred bytes, within `web/bundle-budget.json`.

## Risks / Trade-offs

- A guard in the router could block navigation if a page forgot to remove it. The guard is tied to the dirty state by an effect and removed on unmount, and a test covers both.
- A popstate guard cannot keep the browser's forward history when the user presses Back. The router pushes the editor's entry again, so Cancel keeps the user on the editor at the same address.
