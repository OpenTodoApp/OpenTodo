## 1. Rules and wording

- [x] 1.1 `lib/briefing.ts` `briefingFacts` (D1, D3): Today's facts (late, load, replies), empty Today (done, clear, tomorrow), Upcoming; pure, over live rows without archived projects; verify `lib/briefing.test.ts` over `briefing.fixtures.json`
- [x] 1.2 `app/Briefing.tsx` (D2, D5): `useBriefing` over the shared live snapshots, the notification cache, the review row and the grid preferences; `BriefingText` with the lead, clauses in their tones joined by the language's list pattern, the first clause capitalised, task titles as `user-text`; verify `app/Briefing.test.tsx` in English and Italian
- [x] 1.3 The day head: `TaskListView`'s `ListHeader` passes the briefing to `PageHeader` on Today and Upcoming; verify `npm test` (page rhythm and list tests)
- [x] 1.4 The Daily check opens with Today's briefing (weekly-review "Daily check"); verify `npm test`
- [x] 1.5 The 18 messages in the five catalogs, following the glossary; verify `make i18n-check`

## 2. Docs, tests and baselines

- [x] 2.1 Story for the briefing's modes in the workbench; verify `make ui-check` in CI
- [x] 2.2 Docs: `docs/interface-guide.md` (the day head's briefing) and the Today guide, CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 2.3 Regenerate the visual baselines in the pinned Playwright image; verify the visual job in CI
- [ ] 2.4 Run `npm test` and `npm run build` in web/, open the pull request and get CI green
