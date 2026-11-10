# Tasks

## 1. Outside the app

- [ ] 1.1 Add the Expo module `opentodo-shared-container` (App Group and SharedPreferences read and write, widget reload). Verify: Jest tests with the module mocked, and a Maestro flow on the simulator reading back a written snapshot.
- [ ] 1.2 Move the Swift widget and share extension to `mobile/app/targets/` with the config plugin. Keep the snapshot JSON as a shared fixture of `shellPublish`'s format. Verify: `app-ios` builds both extensions, and a fixture test checks that the app's snapshot equals the fixture.
- [ ] 1.3 Publish on change, sync and refresh with the stale time (D2). Verify: Maestro `widget` flows for complete-in-app and changed-on-web.
- [ ] 1.4 Drain the share inbox into tasks at launch and on foreground. Add the Android share intent. Verify: the Maestro `share-link` flow on both platforms.
- [ ] 1.5 Schedule device reminders (60-window), add the Complete and Snooze actions, and fire once per device. Verify: Jest tests of the window and the reschedule, and the Maestro `reminder-complete` flow.
- [ ] 1.6 Add background refresh (BGAppRefreshTask, WorkManager): pull, widget, reminders, local notifications for new in-app notifications. Verify: a simulator-triggered background task in a Maestro flow, and docs stating the delay.

## 2. Unlock, iPad, Android

- [ ] 2.1 Add biometric unlock with a hardware-wrapped key and the passphrase fallback. Verify: the Maestro `biometric` flow with simulated Face ID enrolled and changed.
- [ ] 2.2 Build the iPad split view, keyboard shortcuts, pointer hover and drag to a sidebar project. Set the target to iPhone and iPad. Verify: Maestro flows on an iPad simulator, and screenshots at regular and compact width.
- [ ] 2.3 Add the Android widget with the same snapshot. Add the Google Play AAB path and the F-Droid metadata, and a CI check that refuses Google Play Services and Firebase. Verify: `app-android` with the dependency check, and a reproducible-build note in `docs/android-reproducible.md`.

## 3. Gate and switch

- [ ] 3.1 Add the go/no-go checklist to `RELEASING.md`, and a `make app-gate` that prints the nightly budgets and Maestro history. Verify: the command prints the last three nightly results.
- [ ] 3.2 Prepare the shell's last release: flush the outbox, show the one-time notice. Verify: a shell test with an unsent op; ships two weeks before the switch.
- [ ] 3.3 Prepare the switch release: the existing bundle id and application id, higher build numbers, address prefill from the shell's storage. Verify: a simulator upgrade test that installs the shell, then the app, and checks the prefilled address.
- [ ] 3.4 After both stores ship it, delete the shell code, `shell.ts` and its fixtures, the shells' CI lanes and `ios-walkthrough.yml`. Retire the preview record. Verify: `make check`, `make bundle-budget` (smaller), and `scripts/ci-changes.sh` tests updated.
- [ ] 3.5 Rewrite `docs/ios-app.md` and `docs/install-phone.md` for the app. Update `apple-shortcuts` and `focus-live-activity` to build on the native app. Add `changelog.d/Changed/native-app-handover.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`.
