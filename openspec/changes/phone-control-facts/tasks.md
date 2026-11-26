## 1. The facts a tap could not reach

- [x] 1.1 Duplicate label: `labelMenuGroups` takes `duplicate`; **Merge into** carries the badge's sentence. Verify: `labelsView.test.tsx` "a duplicate label says what the badge means under Merge into" (`npm test -- labelsView` in web/).
- [x] 1.2 An event that can only be deleted says why above Delete. Verify: `calendar/EventEditor.test.tsx` "says why an event that can only be deleted cannot be changed".
- [x] 1.3 A capped series: the note heads the occurrence menu and is in the projection's name (Month, Day, Week, agenda and Plan rows). Verify: `seriesExceptions.test.tsx` "A capped series".
- [x] 1.4 Skip and This occurrence only: two lines under the buttons, `pointer-fine:hidden`. Verify: `habits.test.tsx` "RecurrenceField actions on a touch screen"; the built stylesheet has the rule under `(pointer: fine)` (`npm run build` in web/).
- [x] 1.5 An origin that is not a link: its menu is titled with the page's title. Verify: `OriginChip.interaction.test.tsx` "the Copy link menu of an origin that is not a link is titled with the page's title".
- [x] 1.6 Reactions name who chose them in the reaction menu items. Verify: `task-detail/commentsTab.test.tsx` "on touch, the More actions menu says who chose each reaction".

## 2. Docs and checks

- [x] 2.1 `docs/interface-guide.md` ("On a phone": Facts) and `changelog.d/Fixed/phone-control-facts.md`. Verify: `npm run docs:build` and `npm run docs:check` in web/.
- [x] 2.2 `npx tsc --noEmit -p .`, `npm run lint`, `npm test` and `npm run build` in web/; `node scripts/ui-check.mjs`, `node --test scripts/repo-checks.test.mjs`, `node scripts/i18n-check.mjs`, `node scripts/bundle-budget.mjs`, `openspec validate --all --strict`.
- [ ] 2.3 Each of the six read with a finger on a phone or the emulator. Verify: by hand; not done in the session that wrote this change.
