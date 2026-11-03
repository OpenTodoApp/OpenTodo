# Tasks

## 1. Back closes the open overlay (touch)

- [x] 1.1 Add `web/src/ui/overlay/useBackToClose.ts`: one numbered marker entry per open overlay on a coarse pointer, batched release, stale markers stepped over, and a `resettable('backToClose')` for tests; call it from `useOverlay` so every overlay shares it; verify `src/ui/overlay/useBackToClose.test.tsx` (Back closes, close button leaves the history clean, nested overlays one at a time and together, StrictMode pushes one entry, a mouse does nothing)
- [x] 1.2 Replace a marker in `navigate()` (`web/src/app/router.ts`) so a route chosen under an overlay keeps the page behind it one Back away; verify `src/app/overlayNavigation.test.tsx`
- [x] 1.3 Close the phone drawer on Back in the shell; verify the drawer tests in `src/app/phoneDrawer.test.tsx`

## 2. The phone drawer is inert when closed and owns the page when open

- [x] 2.1 Mark the drawer `inert` and `aria-hidden` below 768 px while closed, and the page behind it `inert` while it is open; keep the column from 768 px free of both; verify the phone and 1280 px cases in `src/app/phoneDrawer.test.tsx`
- [x] 2.2 Make the open drawer an overlay through `useOverlay` (Escape, Back, focus in and back to the menu button) with `trapTab` staying inside it, and move its scrim into that overlay so a swipe on it does not scroll the page; verify `src/app/phoneDrawer.test.tsx` and `src/app/tabBar.test.tsx`

## 3. A tap in Select mode ticks the row

- [x] 3.1 Add `selectMode` to `TaskRow` and treat it as Shift/Ctrl/⌘ in both click handlers; pass it through `RowContext` from `TaskListView`; verify the Select-mode test in `src/app/rowSwipe.test.tsx`

## 4. The quick add is not pinned on a landscape phone

- [x] 4.1 Add the `pins` custom variant to `web/src/index.css` and use it for every class of `STICKY_QUICK_ADD`; verify the sticky-class test in `src/app/task-list/addPosition.test.tsx`

## 5. Checks and release

- [x] 5.1 `cd web && npm run typecheck && npm run lint`, then `npx vitest run --maxWorkers=4`
- [x] 5.2 `make i18n-check` (no new string) and `openspec validate --all --strict`
- [x] 5.3 CHANGELOG entries under Unreleased → Fixed
