# Tasks

## 1. The card

- [x] 1.1 In `web/src/app/ReminderToasts.tsx`, under `COMPACT_REMINDER_QUERY` draw the compact card: name and time one line each, the count of the other due reminders, a Snooze menu (`Menu kind="menu"` with the three choices) and Dismiss; only the oldest due reminder. Verify: `npx vitest run src/app/reminderCardCompact.test.tsx` (one card, "+1 more reminder", Snooze opens three items, "1 hour" moves `fire_at` by an hour, the next reminder follows; with a mouse two cards of four buttons).
- [x] 1.2 After an answer, move the focus the card held to the next card, or back to the element the reminder took it from. Verify: the same test file ("gives the focus back after the last answer", "focus on the next card").
- [x] 1.3 In `web/src/ui/overlay/Toasts.tsx`, leave a toast where it is while a control inside it is expanded. Verify: `npx vitest run src/ui/overlay/toastClearance.test.tsx` ("stays put while a menu it opened holds the focus").
- [x] 1.4 The string "Snooze" in the seven translated catalogues and `messages.json`. Verify: `node scripts/i18n-check.mjs`.

## 2. In a browser

- [x] 2.1 Built app with the tour's seeded account and its due reminder, Chromium with touch at 360, 390 and 768 px, a mouse at 1280 px; Inbox, Weekly review and the end of Today, before and after. Verify: the card is 122 px tall instead of 170 at the three touch widths, Snooze and Dismiss are 44 px high on one row, the card's bottom is where it was (140 px above the bottom edge on a phone, over the tab bar and the add button; 16 px at 768), and at 1280 px every box of the card is unchanged.
- [x] 2.2 Four due reminders at 360 px, by tap: Snooze opens a sheet with three 44 px items; "Snooze 10 min", "1 hour" and "Tomorrow 09:00" each set that `fire_at` and clear `delivered_at` in the local store and on the server, Dismiss sets `dismissed_at`; one card at a time with "+3", "+2", "+1 more reminders" and then none.
- [x] 2.3 Four due reminders at 768 px, by keyboard: Enter on Snooze opens the menu with focus on its first item; Escape closes the menu only and returns focus to Snooze; Enter, Arrow Down, Enter snoozes one hour; Escape on the card dismisses; Tab reaches Dismiss; after each answer focus is on the next card's Snooze, and the card does not change corner.
- [x] 2.4 German and French at 360 px. Verify: both buttons on one row, the card 122 px, and "+2 weitere Erinnerungen" and "+2 autres rappels" whole beside them.
- [ ] 2.5 The layout check and the tour with their WebKit leg, and the UI check's screenshots (CI). Verify: `make layout-check`, `make ux-audit`, `make ui-check`; re-baseline the screens that show the reminder card with touch or under 640 px.

## 3. Docs

- [x] 3.1 `docs/reminders.md`, `docs/notifications.md` and `docs/task-reminders.md` name the Snooze button on touch; changelog fragment `changelog.d/Changed/reminder-card-compact.md`. Verify: `make docs-check`, `node --test scripts/repo-checks.test.mjs`.

## 4. Checks

- [x] 4.1 `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run` for the reminder, toast, menu and overlay tests, `npm run build` in `web/`, `openspec validate reminder-card-compact --strict`.
- [x] 4.4 The whole `npm test` (CI): the local run was stopped at its time limit on a loaded machine before it finished. Done: green on main, CI run 44897180907 at 6e62dbd69 (21 Nov), which runs this check.
- [x] 4.2 First-load size before and after. Verify: `node scripts/bundle-budget.mjs --json` on both builds: entry +312 bytes gzip, 79 over its budget (design, "Data model, size, interface budget"); the budget file is not edited here.
- [ ] 4.3 On a phone and a tablet (owner): a reminder that falls due while the Android and iOS apps are open shows the compact card beside the system notification; Snooze's sheet closes with a drag down; VoiceOver and TalkBack announce "Reminder: <task>" when it arrives.

---

Shipped in 1.5.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
