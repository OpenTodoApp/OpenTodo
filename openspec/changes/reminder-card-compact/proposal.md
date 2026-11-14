# Proposal

## Why

GitHub issue [#1381](https://github.com/OpenTodoApp/OpenTodo/issues/1381): on a touch screen a due reminder's card is 170 px tall. Its four buttons ("Snooze 10 min", "1 hour", "Tomorrow 09:00", "Dismiss") are 44 px each there and do not fit one row, so Dismiss stands alone on a second one. On a phone the card spans the screen and covers the last rows of a list or a Weekly review step until it is answered, and four due reminders stack into four cards: most of the page.

## What Changes

- **A compact card on touch and in a narrow window.** The task's name and the time take one line each, and the actions one row: **Snooze**, which opens the three snooze choices as a menu (a sheet on a phone), and **Dismiss**. The card is 122 px tall instead of 170.
- **One card at a time there.** The oldest due reminder shows, with "+2 more reminders" in the card; the next one takes its place when the first is answered.
- **Focus follows the answers.** After an answer the focus the card held goes to the next card, or back to where it was before the reminder took it (at every width). A toast stays where it is while a menu it opened holds the focus.
- With a mouse on a window of 640 px or more the card keeps its four buttons and its stack of up to four.

Out of scope: a Done action on the card (see design D4), the card with a mouse, where the card sits (it already shares the toast region and its lift above the tab bar and the add button with the undo toast), the system notifications of push and of the native shells, and whether a shell that already showed a system notification should also show the card (it does today; unchanged).

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone or tablet browser gets the same card.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`: a new requirement, "Compact in-app reminder on touch", beside "In-app delivery".

## Impact

- `web/src/app/ReminderToasts.tsx` (the compact card, the focus after an answer), `web/src/ui/overlay/Toasts.tsx` (the clearance leaves a toast alone while its own menu is open); tests `web/src/app/reminderCardCompact.test.tsx`, `web/src/ui/overlay/toastClearance.test.tsx`.
- One new string, "Snooze", in the eight catalogues. The menu's items reuse the three button texts.
- `docs/reminders.md`, `docs/notifications.md`, `docs/task-reminders.md`.
- No op, field, route, setting or server change. No dependency. The Menu primitive is already in the first load.
- The UI screenshots that show the reminder card below 1280 px, or with touch, change.
