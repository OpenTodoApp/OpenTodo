# Tasks

## 1. Routing

- [x] 1.1 `router.ts`: `/routines/new` (and `#new`) as a new routine, `/routines/<id>?run=` kept in the tracked address, `/rules/...` redirects; `setLeaveGuard` asked by `navigate` and on `popstate`; verify `router.test.ts`
- [x] 1.2 `Shell.tsx` loads `RoutinePage` lazily for a routine address; `routineNav.ts` hands a view's or board's draft to `/routines/new`; `ViewsView.tsx` and `RuleEditor.tsx` use it; verify `npm test` and `npm run build`

## 2. The page

- [x] 2.1 `RoutineEditor.tsx` renders the page: sticky header with breadcrumb, Back, unsaved indicator, Test, Run now and Save; phone footer with the actions; two columns from 1024 px and tabs below; Save stays on the page and a new routine moves to its id; a save message clears on edit; verify happy-dom tests in `routines.test.tsx`
- [x] 2.2 `RunHistory.tsx`: `RunDetailBody` inline in the History column; the Runs tab opens a live routine's run on its page; verify the "Run detail" test
- [x] 2.3 Leave guard with the confirm dialog, `beforeunload`, Escape; focus to the heading on open and to the row on Back; `Ctrl+S` in the editor and in `lib/shortcuts.ts`; verify happy-dom tests ("Unsaved changes", "Save a new routine")

## 3. Quality

- [x] 3.1 Strings in six languages; verify `make i18n-check`
- [x] 3.2 Stories for the page (wide and phone) and new baselines for the routines screens only; verify `make ui-check`
- [x] 3.3 Layout check screens `routines` and `routine-new` at every width; verify `make layout-check` with `ONLY=routines,routine-new`
- [x] 3.4 Docs (`docs/routines.md`, keyboard), CHANGELOG; verify `make docs-check`, `make bundle-budget`, `make openspec-validate`
