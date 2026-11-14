# Tasks

## 1. Web app

- [x] 1.1 Add `web/src/app/phoneFrame.tsx`: the frame classes of the phone bar and the tab bar, `hasPhoneChrome` (moved out of `Shell`) and `PhoneFrameSkeleton`; use the constants in `Shell` and `TabBar`. Verify: `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run src/app/phoneFrame.test.tsx` (the skeleton's bar and tab bar carry the real frame; the real tab bar carries it too; no hairline on a day page; rows only when never signed in or on a screen without the tab bar).
- [x] 1.2 Wrap `App`'s loading rows in the skeleton, with the chrome only on a device that holds an account. Verify: at 360 × 740 in Chromium with the status request held back, the bar, the menu button's box, the tab bar and each tab have the same boxes in the skeleton and in the loaded app, for Inbox, Today and Upcoming, touch and mouse, light and dark, with and without safe-area insets (the numbers are in the design); at 768 px no chrome shows.
- [x] 1.3 Measure the first load. Verify: `npm run build`, `node scripts/bundle-budget.mjs` passes (entry +216 bytes gzip, exactly on the budget; `web/bundle-budget.json` untouched).

## 2. Android

- [x] 2.1 `Theme.OpenTodo.Launch` for `MainActivity`: `@drawable/launch` (the colour and the launcher icon) as the window background, the platform splash attributes in `values-v31`, `launch_background` in `values` and `values-night`. Verify: `node --test scripts/repo-checks.test.mjs` (the manifest uses the theme, both variants exist, no splash library); the XML parses. CI's `android` job is the first build and lint.
- [x] 2.2 `LaunchHold` (the cap, the moment after a load, something to show) with unit tests. Verify: `LaunchHoldTest` in CI's `android` job (`./gradlew :app:testDebugUnitTest`); not run here.
- [x] 2.3 `MainActivity`: hold the launch screen (no root background, the web view invisible, the first frame held back from Android 12), reveal on the visual-state callback after `onPageFinished`, on an error screen or the Change server dialog, and when the hold is due; bars asked for meanwhile come with the reveal. Verify: the instrumented test `BridgeTest.theWebViewShowsOnceThePageHasLoaded` and the existing instrumented tests in CI's `android` job; not compiled here.

## 3. iOS

- [x] 3.1 `LaunchBackground.colorset` (light and dark) and `UILaunchScreen` → `UIColorName` in `project.yml` and `Info.plist`. Verify: `node --test scripts/repo-checks.test.mjs` (both files agree, the colours equal Android's and the dark one the web manifest's); `LaunchScreenTests.testTheLaunchScreenNamesAColourOfTheBundle` in CI's `ios` job.
- [x] 3.2 `ShellView.swift`: the web view at alpha 0 over the launch colour, `reveal()` at `didFinish`, at a load failure and after five seconds; the status bar icons of the remembered bars come with it. Verify: `LaunchScreenTests` (hidden until revealed, the icons wait) and the existing tests in CI's `ios` job; not compiled here.

## 4. Docs and release

- [x] 4.1 "Opening the app" in `docs/android-app.md` and `docs/ios-app.md`, the corrected bar sentences, `mobile/README.md` and `mobile/AUDIT.md`. Verify: `make docs`, `make docs-check`.
- [x] 4.2 Add `changelog.d/Fixed/shell-first-paint.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [ ] 4.3 Run `make check`, and see the `android` and `ios` jobs pass on the pull request. Verify: they pass.

## 5. On a phone (owner)

- [ ] 5.1 Android 12 or later, light and dark: the icon stays until the page shows, with no blank frame; with the server stopped the error screen follows at once; with a slow server the page shows after five seconds at most.
- [ ] 5.2 Android 11 or earlier: the same, and the icon does not move between the starting window and the app's own window.
- [ ] 5.3 iPhone, light and dark: the launch colour, then the page with a short fade, no white or green screen between them; the status bar icons are readable throughout.
- [ ] 5.4 Either phone: at a cold start the top bar and the tab bar do not move when the tasks replace the skeleton.
