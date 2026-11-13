# Tasks

## 1. Contract

- [ ] 1.1 Add `saveFile` and `haptic` to `OpenTodoShell` and `files`, `haptics` to the capabilities in `web/src/lib/shell.ts`; add their payloads (a two-chunk file, both kinds, an unknown kind) to the shared bridge fixtures. Verify: `npm test` in `web/` (the fixture test fails before regenerating, passes after).

## 2. Web app

- [ ] 2.1 Add `web/src/lib/saveFile.ts` (bridge in chunks of 256 KB when `files` is listed, the anchor otherwise; resolves `saved`, `cancelled` or `failed`) with tests for both paths, chunk order and a failed chunk. Verify: `npm test`.
- [ ] 2.2 Route the eight hand-built saves through it and tell the user when a save failed. Verify: `npm test`; `grep -rn "\.download = " web/src` finds only `saveFile.ts`.
- [ ] 2.3 Haptics: `tick()` and `success()` through the bridge when `haptics` is listed, `navigator.vibrate` otherwise; `canVibrate()` true for either; completion calls `success()`. Verify: `npm test` (bridge called once with the kind; nothing with the preference off), `npm run build`.

## 3. Android

- [ ] 3.1 `saveFile` on the bridge: chunk assembly in the cache directory, `ACTION_CREATE_DOCUMENT`, copy, clean-up, the three answers; capability `files` only with a screen. Verify: unit tests for assembly, name reduction, a new id discarding the old file, and the fixture; `make android`.
- [ ] 3.2 `DownloadListener`: same-origin fetch with the web view's cookies into the cache file, then the save dialog; other addresses as foreign links. Verify: unit tests of the origin check and the file name from `Content-Disposition`; `make android`.
- [ ] 3.3 Back: keep the callback enabled and move the task to the back on the first screen. Verify: an instrumented test that presses Back to leave, resumes, navigates and presses Back, and finds the activity resumed.
- [ ] 3.4 `haptic` on the bridge and capability `haptics`. Verify: unit test of the kind mapping and the unknown kind; `make android`.

## 4. iOS

- [ ] 4.1 Downloads: the download policy for the server's origin, `WKDownloadDelegate` into a temporary file, the export picker, clean-up. Verify: unit tests of the policy decision (own origin, `blob:`, foreign host) in `OpenTodoTests`; the `ios` CI job.
- [ ] 4.2 `NSFaceIDUsageDescription` in `project.yml` and its translations. Verify: a unit test reads the key from the bundle; a repo check that the key exists.
- [ ] 4.3 Done: the third notification action and `done` passed through `AppModel`. Verify: unit test that `show(reminder:action:"done")` builds the fixture's address.
- [ ] 4.4 Status bar icons from the stored choice through the root controller, applied at launch and on hand-over, without changing the page's colour scheme. Verify: unit test of the stored choice to style mapping; the UI walkthrough still launches.
- [ ] 4.5 `haptic` on the bridge and capability `haptics` (not in a background run). Verify: unit test of the kind mapping and of the capability list.

## 5. Docs and release

- [ ] 5.1 Update `docs/android-app.md`, the iOS app page and `mobile/README.md` (saving files, Done, haptics; the older-server note); tick the items in `mobile/AUDIT.md`. Verify: `make docs`, `make docs-check`.
- [ ] 5.2 Add `changelog.d/Fixed/shell-repairs.md`. Verify: `make repo-check`.
- [ ] 5.3 Run `make check`. Verify: it passes.

## 6. On a phone (owner)

- [ ] 6.1 Android: save the recovery key and a JSON export, cancel one save; Back after leaving and returning; feel a completion; Done from a notification.
- [ ] 6.2 iPhone: the same saves; Face ID unlock of an encrypted account; Done from a notification; a dark theme under a light system shows light status bar icons; feel a completion.
