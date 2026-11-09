# Tasks

## 1. The date field

- [ ] 1.1 `DatePicker` takes a placeholder example per locale and reads a typed time through the quick-add date reader when the date reader alone does not understand the text; the preview names the time. Verify with unit tests in `web/src/app/datetime/DatePicker.test.tsx` (`fri`, `tomorrow 3pm`, a German example) and with an i18n test that parses every catalogue's example. Run `npm test` in web/.
- [ ] 1.2 Compact quick choices on one line, the date in each choice's accessible name and tooltip, no "No date" in Do on, and a preview with no height while empty. Verify by updating the When popover story baselines with `make ui-check`.

## 2. The time of day row

- [ ] 2.1 One helper in `web/src/lib/dayParts.ts` builds the Do on batch for a part, Any time or a time (D2), and leaves every other writer alone. Verify with unit tests for each choice, including the clearing of `due.time` and `due.tz` and the Any time pairing on a time.
- [ ] 2.2 `DoOn` renders the row (Any time | Morning | Afternoon | Evening | Time, or without Morning and Afternoon while day parts are off), disabled without a date, with selection read as D1 says. Verify with an interaction test (happy-dom, `waitFor`) covering each scenario of `web-app` "Do on segment", plus Undo.
- [ ] 2.3 The time line: `TimeField` with its suggestions and `ZoneControl`'s `inline` variant at the line's end; "Add time", "Remove time" and the separate zone line are removed, and `z` still toggles. Verify with an interaction test and the story baselines in light, dark, 375 and 1280 px.
- [ ] 2.4 "Evening" replaces "This Evening" in the control in every catalogue, while Today's heading keeps "This Evening". Verify with `make i18n-check` and `npm test`.

## 3. Docs and checks

- [ ] 3.1 Update When and Evening in `docs/tasks-and-projects.md` and add `changelog.d/Changed/when-picker.md`. Verify with `make docs` and `make docs-check`.
- [ ] 3.2 Confirm the first load stays within `web/bundle-budget.json`. Verify with `npm run build` in web/ and `make bundle-budget`.
- [ ] 3.3 `make openspec-validate` and `make check` pass.
