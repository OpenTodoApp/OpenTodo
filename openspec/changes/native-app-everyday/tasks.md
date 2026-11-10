# Tasks

## 1. Shell of the app

- [ ] 1.1 Set up the five tabs with their own stacks, large titles, the Inbox badge and the add button (bottom accessory on iOS 26, navigation-bar button before it, FAB on Android). Verify: Jest navigation tests, and the Maestro `tabs` flow on the simulator and the emulator.
- [ ] 1.2 Run the list spike: `@legendapp/list` against `@shopify/flash-list` with 2,000 rows (scroll at 120 Hz, completion re-render). Record the choice in design D3. Verify: a CI artifact with frame times.

## 2. Lists

- [ ] 2.1 Build Today, Inbox and Upcoming from the shared selectors (`closedList`, `flow`, `inbox`, `liveTasks`). Verify: Jest tests that they list the same tasks as the shared web selectors for the perf fixture's sample.
- [ ] 2.2 Add swipe actions, the completion grace period with Undo and haptics, and the accessibility actions. Verify: the Maestro `complete`, `undo` and `voiceover-actions` flows.
- [ ] 2.3 Add the context menu with preview, long-press drag reorder (shared `ordering`), edit mode and the bulk toolbar. Verify: the Maestro `reorder` and `bulk` flows, and a Jest convergence test for the rank.
- [ ] 2.4 Add pull to sync and the offline status line. Verify: the Maestro `offline` flow.

## 3. Capture

- [ ] 3.1 Build the capture sheet with the focused field, inline parse highlighting (`nlp/quickadd` spans), the keyboard toolbar chips, Return-to-add and the context rule. Verify: Jest parser-to-chips tests, and the Maestro `capture` flow asserting the keyboard is up within 250 ms.

## 4. Detail and pickers

- [ ] 4.1 Build the task detail: in-place title, Markdown notes through the shared fold-in, field rows, subtasks, attachments (QuickLook or system viewer) and comments. Verify: a Jest round-trip test of every block type through the fold-in, and the Maestro `detail-edit` flow.
- [ ] 4.2 Build the date sheet (quick choices, natural-language line, system calendar, time, recurrence presets and custom), the searchable entity sheets and the priority menu. Verify: Jest tests for the typed date and recurrence rules, and the Maestro `schedule` flow.

## 5. Browse, Search, Settings, unlock

- [ ] 5.1 Build Browse: projects with sections, labels, saved views (shared `filter/evaluate`), notes (rendered and Markdown edit), Logbook. Verify: a Jest test that saved views match the web evaluator's vectors, and the Maestro `browse` flow.
- [ ] 5.2 Build Search over tasks and notes, offline. Verify: the Maestro `search-offline` flow.
- [ ] 5.3 Build Settings: account, server, appearance, app notifications, sign-out, Open on the web. Verify: the Maestro `settings` flow, including sign-out leaving no account data.
- [ ] 5.4 Add passphrase unlock for encrypted accounts. Verify: the Maestro `e2ee-unlock` flow against an encrypted CI account, and a Jest test that the key never reaches MMKV or SQLite.

## 6. Quality and docs

- [ ] 6.1 Add accessibility labels everywhere and Dynamic Type up to the accessibility sizes. Pass the XCUITest audit and the Espresso checks on every screen. Verify: `app-ios` and `app-android` green with the audits.
- [ ] 6.2 Upload screenshots of every screen (light, dark, standard and largest text) as `app-ios` artifacts. Verify: the artifact lists every screen.
- [ ] 6.3 Update `docs/app.md` with the screens and gestures. Add `changelog.d/Added/native-app-everyday.md`. Verify: `make docs-check`, `make check`.
