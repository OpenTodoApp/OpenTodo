## 1. The task page

- [x] 1.1 Chips for the facts to add, Attach among them (design D1): `FactRow.tsx` `FactChips`, `PhoneTaskView.tsx`, `PhoneTaskPage.tsx`, `AttachmentsRow.tsx` `AttachMenu`. Verify: `phoneCalm.test.tsx`: the chips are buttons in one list ending with Attach, and no paperclip shows under the note.
- [x] 1.2 The bar holds Back and the menu, stepping in the menu (design D2): `PhoneTaskView.tsx`, `TaskActionsMenu.tsx`. Verify: `phoneScreens.test.tsx`: no arrows in the bar; the menu's Next task carries "n of m" and opens the next task.

## 2. Today

- [x] 2.1 Display options in the menu (design D3): `DisplayPanel.tsx`, `ListChrome.tsx`, `useListScreen.tsx`. Verify: `phoneCalm.test.tsx`: no display button in Today's header on a phone, the menu's Display options opens the panel.
- [x] 2.2 The briefing without the late tasks (design D4): `PhoneList.tsx`. Verify: `phoneListParts.test.tsx`: with only late tasks no briefing line shows.
- [x] 2.3 One Reschedule control (design D5): `EarlierActions.tsx`. Verify: `phoneScreens.test.tsx` and `phoneListParts.test.tsx`: the Earlier header has one control, its Today moves every task.
- [x] 2.4 The Done today card opens its group (design D6): `TodayGlance.tsx`, `PhoneList.tsx`. Verify: `phoneCalm.test.tsx`: a tap opens the group.
- [x] 2.5 Yesterday in rows (design D7): `lib/dates.ts`, `phone/rowModel.tsx`. Verify: `rowModel.test.tsx`.
- [x] 2.6 Zero totals left out (design D9): `lib/time.ts`. Verify: its test.

## 3. The tab bar

- [x] 3.1 No count on the current tab, the fade under the bar (design D8): `TabBar.tsx`. Verify: `phoneDelight.test.tsx` and `tabBar.test.tsx` updated.

## 4. Checks and docs

- [x] 4.1 Strings in every catalogue, `messages.json` regenerated. Verify: `node scripts/i18n-check.mjs`.
- [ ] 4.2 Stories and baselines for the changed states; full CI on the branch. Verify: the full CI run passes.
- [x] 4.3 `docs/phone-screens.md`, `changelog.d/Changed/phone-calm.md`, docs build. Verify: `make docs-check`.
- [ ] 4.4 Screenshots at 390 px sent to the owner.
