# Tasks

## 1. Web app

- [x] 1.1 `web/src/lib/keyboardLikely.ts`: `touchOnly()`, `raisesKeyboard()`, `KEYBOARD_ATTR` (re-exported by `keyboardSeen.ts`). Verify: `npx vitest run src/lib/keyboardLikely.test.ts src/lib/keyboardSeen.test.ts` (the answer per device, the fallback, the same question as `index.css`).
- [x] 1.2 `focusInto` leaves focus on the panel for a field that did not ask, `trapTab` goes from the panel to the field, `pickerField()` and `restInOverlay()` (`web/src/ui/overlay/stack.ts`). Verify: `npx vitest run src/ui/overlay/sheetFocus.test.tsx`.
- [x] 1.3 Pickers use the rule: `ComboboxPanel`, `Combobox`, `ComboboxField autoFocus="keyboard"` (template picker, Add step), `IconPicker`, the cheat sheet, routine starters, `WhenControl`. Verify: `npx vitest run src/app/touchSheetFocus.test.tsx` (When sheet and label picker without and with a keyboard, after a hardware key, a name prompt in both), `npx vitest run src/ui src/app/task-detail src/app/pickers.test.tsx src/app/palette`, `npx tsc --noEmit`, `npx eslint` on the changed files.
- [x] 1.4 First load within budget. Verify: `cd web && npm run build && cd .. && node scripts/bundle-budget.mjs`.
- [x] 1.5 The whole suite. Verify: `cd web && npm test`.

## 2. Checks in a browser

- [x] 2.1 Built app, seeded account, Chromium at 360 px with touch emulation: by tap, the When sheet opens with focus on the calendar's current day and the label picker with focus on the sheet; a tap on Deadline keeps the field unfocused; a tap on the field focuses it; closing returns focus to the part; quick add focuses its field. Verify: `document.activeElement` after each step and a screenshot of both sheets.
- [x] 2.2 The same run after pressing `j` first: the When sheet focuses its date field and the label picker its field. Verify: `document.activeElement`.
- [ ] 2.3 On a phone, in the Android and the iOS app and in Safari: the When sheet and the label picker open without the keyboard; a tap on the field raises it and the sheet sits above it; quick add, a comment and Rename raise it at once; with VoiceOver and TalkBack the sheet's name is announced on open.
- [ ] 2.4 On a tablet with a keyboard case and no trackpad: after the first key press the pickers focus their fields.

## 3. Docs and release

- [x] 3.1 `docs/design-system.md` (focus on open on touch devices) and `docs/install-phone.md` (pickers open without the keyboard). Verify: `make docs`, `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Fixed/touch-sheet-focus.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
