# Tasks

## 1. Plain wording in the chooser and the start guide

- [x] 1.1 In `web/src/lib/settingsCopy.ts`, replace the `how-you-work` card line, the three labels and the three descriptions with the wording of design D1 (items 1–7). Verify: `cd web && npm test -- settingsCopy` passes (labels ≤ 4 words, options ≤ 60, line ≤ 90).
- [x] 1.2 In `web/src/app/method/MethodModeChooser.tsx`, change the link to "What is {method}?" and the starter and start-view offers to the D1 wording (items 8, 9, 11). Update the file's header comment. Verify: `cd web && npm test -- howYouWork methodLink` passes after updating their expectations.
- [x] 1.3 In `web/src/app/FirstRun.tsx` `WorkStep`, add the intro sentence (D1, item 13) above the chooser. Verify: on the start guide's step 2 in `make dev`, the sentence shows at 1280 px and at 390 px, and the sheet stays within two thirds of the screen.
- [x] 1.4 In `web/src/app/settingsIndex.ts`, update the How you work search description (item 12). Verify: searching Settings for "method" or "simple lists" finds How you work (`cd web && npm test -- settingsIndex`, or the existing settings search test).
- [x] 1.5 Add the D3 test to `web/src/app/firstRun.test.tsx`: no unexplained method term in step 2 or its offers, and no option label equal to a mode value or an old label. Update the tests and stories that match the old labels: `appearance`, `sidebar`, `phoneDrawer`, `review/review`, `methodLink.stories`, `phone.stories`. Verify: `cd web && npm test`; the new test fails on a checkout without 1.1–1.3. Done: only `appearance.test.tsx` asserted visible old text; the stories and test titles name the internal modes (`companion`, `first`), which are unchanged, so they keep their names and baseline files.

## 2. Translations

- [x] 2.1 Run the extractor, then add de, es, fr, it and pt translations for every new key in the plain register, with "Open Loops" untranslated (D4). The catalogs have no comment mechanism, so instead of translator comments the three labels were translated in context with their descriptions. Verify: `make i18n-check` passes, with no missing, untranslated, stale or placeholder-mismatched entry.
- [x] 2.2 Check the German step 2 in `make dev` with the language set to Deutsch. Verify: the labels fit their cards at 360 px without truncation (layout check `start-guide` overlay, `make layout-check`). Checked by CI's layout job.

## 3. Docs, Help and baselines

- [x] 3.1 Update `docs/method/set-up.md` (the three bullets and the offer paragraph), `docs/settings-you.md:31`, `docs/your-first-task.md:18` and `docs/method/overview.md:50` to the new labels and the "What is Open Loops?" link. Then run `make docs`. Verify: `npm run docs:check`, and `web/src/generated/help.json` contains no "Companion" or "Lists only" outside the change's history.
- [x] 3.2 Update the visual baselines of the start guide and Settings → How you work after inspecting each diff, and re-take the docs screenshots that show step 2 (`make docs-screenshots`). Verify: `make ui-check` passes, and every changed baseline differs only in this copy. Done through the CI artifact flow on the PR.

## 4. Release

- [x] 4.1 Add a CHANGELOG.md entry under Unreleased ("Plainer words in the start guide and How you work", Fixes #433). Verify: `npm run docs:check`.
- [x] 4.2 Run `make check` and `make openspec-validate`. Verify: both pass.
- [x] 4.3 After the PR is merged, reply on issue #433 with a short, friendly note: which words changed, a before/after of the three choices, and the release they land in. Then close the issue. Verify: `gh issue view 433 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
