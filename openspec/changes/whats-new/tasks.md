## 1. Entries

- [x] 1.1 Add `news/` (a short README and no backfilled history), `scripts/news-build.mjs` writing `web/src/generated/news.json`, and `make news-check` on `make check` beside `templates-check`. The check fails on a stale JSON file, a missing version or date, a duplicate version, a body over four sentences, and a `## [x.y.z]` changelog section newer than the first news file with no `news/x.y.z.md`. An empty directory passes. Verify `node --test scripts/news-check.test.mjs` and `make news-check`.

## 2. The card

- [x] 2.1 Add the What's new card on Settings → About, lazy-loaded, with the Version notices switch first (`localStorage` `ot:news-notify`, default on), the newest entry, a closed Earlier versions disclosure, and the release link as a new-tab anchor. English bodies; a translated "these notes are in English" note when the language is not English and an entry exists. Empty state when there are no entries. Verify `cd web && npm test -- aboutNews` (empty state, newest entry, disclosure closed, French note, changelog link does not fetch).
- [x] 2.2 The dot on the card and on About in the settings list while notices are on, the server version matches an unopened entry, and the version is known. Opening the card writes `ot:news-seen` and clears the dots, including when notices are off. No dot on the main sidebar. Verify the same test file (first open, open clears, notices off, unknown version, second device is a fresh storage).
- [x] 2.3 Rename the X row to Follow on X. Move search keywords so "news", "changelog" and "what's new" land on the card, and "x" and "twitter" land on Follow on X. Row copy stays within the settings-copy limits. Verify `cd web && npm test -- settingsSearch` and `cd web && npm test -- settingsCopy`.

## 3. Docs and languages

- [x] 3.1 Translate the new chrome in the catalogues. Verify `make i18n-check`.
- [x] 3.2 Describe the card in `docs/feedback-and-support.md` (shipped with the app, no fetch, the switch). Verify `make docs-check`.

## 4. Check

- [ ] 4.1 `cd web && npm test && npm run build`. If the first load exceeds `web/bundle-budget.json`, raise it in the same change and record the reason. Then `make check`.
