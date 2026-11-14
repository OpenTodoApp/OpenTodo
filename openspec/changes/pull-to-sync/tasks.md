# Tasks

## 1. Contract

- [x] 1.1 Add `pull-refresh` to the capabilities and `pullHandled` to `OpenTodoShell` in `web/src/lib/shell.ts`, with `takeOverPull()`; add `pull.json` to the shared bridge fixtures. Verify: `npx vitest run src/lib/shellBridge.fixture.test.ts` in `web/` (fails before regenerating, passes after).

## 2. Web app

- [x] 2.1 The gesture as pure decisions and a watcher in `web/src/app/pullToSync.ts` (`pullStarts`, `pullLockOf`, `pullOffset`, `pullFires`, `ownsTouch`, `watchPull`). Verify: `npx vitest run src/app/pullToSync.test.ts` (starts only at the top, vertical dominance, threshold, cancelled by a sideways move, a prevented move, a second finger; nothing from a mouse or a wheel).
- [x] 2.2 The mark and the sync in `web/src/app/PullToSync.tsx`: follows the pull, syncs once on release, spins and is announced while it runs, goes when it settles, says Offline, Signed out, Locked or the error, never reloads, stays in place under reduced motion, calls `pullHandled` in a shell that lists `pull-refresh`. Verify: `npx vitest run src/app/PullToSync.test.tsx`.
- [x] 2.3 Mount it in `Shell.tsx` as a lazy chunk on a coarse pointer only. Verify: `npx tsc --noEmit`, `npx eslint` on the changed files, `npm run build`, `node scripts/bundle-budget.mjs` (first load within its budget).
- [x] 2.4 Check in a real browser: Chromium emulating a 360 px phone with touch against the built server. Verify: a pull on Today follows the finger with every touch move prevented, sends one `POST /api/v1/sync` on release and none before, shows and hides the mark, keeps the page; a short pull, a sideways swipe, a scrolled list and the Week grid send nothing; offline shows the "Offline" toast; with reduced motion the mark stays in place; at 1280 px with a mouse the chunk is never requested.

## 3. iOS

- [x] 3.1 `PullRefresh`, capability `pull-refresh` in the visible app, `pullHandled` in the page script and the message handler (`Bridge.swift`); the notification from `BridgeHost`; `ShellController` takes the refresh control off on the call and puts it back on `didCommit`. Verify: unit tests in `OpenTodoTests/ShellDataTests.swift` (the fixture's capability and method, the capability list with and without a screen, the page script, the flag across calls and page loads); the `ios` CI job, which is the first compiler for this code.
- [ ] 3.2 On an iPhone with the current web app: pulling Today down syncs, shows the web mark and no native spinner, and the page is not reloaded; a sign-in page and a server without this change still reload on a pull. Verify: by hand on a device or the simulator (owner).

## 4. Android and the installed web app

- [ ] 4.1 On an Android phone (the app and the installed web app) and in the installed web app on an iPhone: the pull syncs, the page does not bounce or reload under it, row swipes, the edge swipe and the long-press drag behave as before. Verify: by hand on devices (owner).

## 5. Docs and release

- [x] 5.1 `docs/offline-and-sync.md` (pull to sync), `docs/ios-app.md` (no reload; the older-server note), `docs/interface-guide.md` (the gesture's numbers), `mobile/README.md` (the bridge member, `ShellView`), `changelog.d/Added/pull-to-sync.md`. Verify: `make docs`, `make docs-check`, `node --test scripts/repo-checks.test.mjs`, `openspec validate pull-to-sync --strict`.
