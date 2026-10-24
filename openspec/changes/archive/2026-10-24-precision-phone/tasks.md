## 1. The phone shell

- [x] 1.1 The day head stays in the page below 768 px (D1): `PageHeader` renders the title at the display step, the lead line and the briefing for `kind="day"` and tells the bar `day`; the bar shows no title and no hairline then; verify `precisionPhone.test.tsx` "the day head on a phone" and `pageRhythm.test.tsx`
- [x] 1.2 Back takes the menu button's place in the phone bar (D1); verify `precisionPhone.test.tsx` "the task page on a phone"
- [x] 1.3 The tab bar: Inbox, Today, Upcoming and Search, the current tab in the strong tone, More removed and the drawer opened from the bar's menu button (D3); verify `tabBar.test.tsx` and `phoneDrawer.test.tsx`

## 2. Rows and facts

- [x] 2.1 The phone row (D2): `phoneCell()` marks one cell `data-row-phone`; index.css makes the row one 44 px line with the 14.5 px title, the kept cell at its end, the time before the title only where there is one; verify `precisionPhone.test.tsx` "the phone row" and the layout check at 360 and 390 px
- [x] 2.2 Stacked facts (D4): `TaskFacts` `stacked` with `stackedFirst()` and "More properties"; an editor opened for a hidden row shows them all; verify `precisionPhone.test.tsx` "the stacked facts" and `taskPage.test.tsx`
- [x] 2.3 The string "More properties" in the five catalogs; verify `make i18n-check`

## 3. Stories, docs, checks

- [x] 3.1 The "Today" phone story; the task page story shows the stacked facts; verify `make ui-check` builds them
- [x] 3.2 Render Today, a project and a task page from the real app at 390×844 in dark and light and compare them with `phone-today.png` and `phone-task.png`
- [x] 3.3 Update the phone sections of the guides (`docs/` interface guide and the task page guide) and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 3.4 Regenerate the visual baselines with the "UI baselines" workflow; verify `make ui-check` in CI
- [x] 3.5 Run `npm test` and `npm run build` in `web/`, open the pull request and get CI green, the layout check at 360, 390 and 768 px included
