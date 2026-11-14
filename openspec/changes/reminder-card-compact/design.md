# Design

## Context

GitHub issue 1381, seen in the interface tour at 360 and 768 px with touch. What the code does today:

- **One component.** `ReminderToasts` (`web/src/app/ReminderToasts.tsx`), mounted once by the Shell, draws a card per due reminder from the watcher's list (`lib/reminderWatcher.ts`, oldest first): up to four cards, then "+N more reminders" as loose text under them. Each card is an `alertdialog` named "Reminder: <task>" in an assertive live region; a new reminder takes focus unless the person is typing or in a dialog or menu (`keepFocus`); Escape on a card dismisses.
- **Where it sits.** The cards are children of `ToastRegion` (`web/src/ui/overlay/Toasts.tsx`), the same region the undo toast uses. Its bottom is `--vv-bottom + --toast-lift + --selection-lift + safe area`; the Shell publishes `--toast-lift` (`usePhoneChrome`: the tab bar plus the add button's footprint on a phone, 5 rem below 768 px without the phone chrome, 0 from 768 px), and the selection bar adds `--selection-lift`. So the reminder already stands clear of the tab bar, the add button and the selection bar exactly as the undo toast does; nothing to share that is not shared. Neither toast knows a page's own bottom action: over the Weekly review the lift for the add button, which that screen does not show, happens to leave the "Next" button free (measured below).
- **Why it is tall on touch.** With a coarse pointer every button is at least 44 × 44 px (`index.css`). The four buttons need 351 px and the card has 310 to 326, so Dismiss wraps: 170 px at 360, 390 and 768 px. With a mouse the same wrap gives 140 px.
- **Native shells.** The watcher does not know about a shell. A reminder the service worker showed as a system notification is skipped in the app (`reminders:shown`), but a shell's alarm notification is not recorded there, and iOS shows its banner in front of the open app on purpose (`Notifications.swift`, `willPresent`). So in a shell an open app shows the card and the system shows its notification. This change keeps that.
- **Done.** System notifications offer Done (`reminder-done-action`); the card never has.

## Goals / Non-Goals

**Goals:** a card that covers less of a phone; two 44 px actions on one row; every snooze choice still two taps away; several due reminders cover no more than one; focus and announcement as good or better.

**Non-Goals:** changing the card with a mouse, where toasts sit, the notifications outside the app, a Done action.

## Decisions

### D1. One Snooze menu

On touch the three snooze buttons become one "Snooze" button that opens the existing Menu primitive (`kind="menu"`): a popover from 640 px, a bottom sheet titled "Snooze" below it, with the menu's keyboard model. Its items are the three texts the buttons had ("Snooze 10 min", "1 hour", "Tomorrow 09:00"), so the only new string is "Snooze". The name and the time are cut after one line each; the whole name is in the card's accessible name and in the task. Card: 122 px (12 + 44 + 8 + 44 + 12, and the border) instead of 170.

Rejected:
- Name, time and both buttons on one row (about 70 px): at 360 px it leaves the name about 130 px.
- Smaller buttons: under the 44 px touch target.
- "Snooze" snoozing 10 minutes at once with the other choices behind a long press: hidden, and the wrong default for half the reminders.

### D2. Where it applies: `(pointer: coarse), (max-width: 39.99rem)`

A coarse pointer is where the buttons are 44 px; under 640 px the card spans the window and a popover is already a sheet. The query lives beside the component (`COMPACT_REMINDER_QUERY`), read with `useMediaQuery`, as `COMPACT_LANE_QUERY` does for the calendar. With a mouse from 640 px the card keeps its four buttons: one click per choice is worth more there than 18 px. It still wraps Dismiss with a mouse (140 px); making the compact card the only card would remove that and a branch of the component, and is left to the owner.

### D3. One card at a time

In the compact form only the oldest due reminder shows, with the count of the others ("+3 more reminders", the existing string) at the start of the action row, inside the card where it can be read. Answering it brings the next. `app-shell` "Notices are toasts" asks for one stack and is unchanged; four cards of 122 px would still be most of a phone. The stack of up to four stays with a mouse.

### D4. No Done on the card

Considered, because the system notification has it. Not added: the card's name already opens the task, where completing has its animation, its Undo offer and the repeating-task handling in view; completing from the card would need its own Undo offer; and a third 44 px action takes the room of the count at 360 px. It can follow as its own change.

### D5. Focus

The card's first control (Snooze, or "Snooze 10 min" with a mouse) carries `data-reminder-first`; a new reminder focuses it as before and now remembers the element it took focus from. After an answer, focus that is in the card or lost with it moves to the next card's first control, or back to the remembered element when no card is left. Before, focus fell to the page's body. This applies at every width.

`useToastClearance` moves a toast away from keyboard focus it covers. A menu opened from the toast opens over it, so its first item made the toast jump to the other corner (seen at 768 px). The clearance now leaves the toast alone while a control inside it has `aria-expanded="true"`; the undo toast has no such control.

Escape: the overlay stack takes Escape while the menu is open (capture phase, propagation stopped), so the card's own Escape handler, which dismisses, does not run. Checked in the browser.

## Data model, size, interface budget

- No op, field, table, route or setting. Snooze and Dismiss are the existing reminder operations (`snoozeReminder`, `dismissReminder`).
- No dependency; image size and memory unchanged. `Menu` and `MenuItem` are already in the first-load chunk; the first load grows by the branch and the focus handling: the entry chunk from 150,295 to 150,607 bytes gzip (+312), the first load from 724,258 to 724,858 (+600). The entry budget is 147 KB (150,528 bytes) and had 233 bytes left, so the entry is 79 bytes over it; `web/bundle-budget.json` is not edited in this change and needs raising where it merges. Loading the card lazily would cost a chunk of its own for less than half a kilobyte.
- Interface budget (`docs/interface-guide.md`): no chrome above a list, no task property, no sidebar destination, no scroll region and no shortcut is added. The card loses two buttons on touch.

## Measured (Chromium, touch, built app, the tour's seeded account)

| Width | Before | After |
| --- | --- | --- |
| 360 | 336 × 170, Dismiss on a second row | 336 × 122, one row |
| 390 | 366 × 170 | 366 × 122 |
| 768 | 352 × 170 | 352 × 122 |
| 1280, mouse | 352 × 140 | 352 × 140 (unchanged) |

Over the Weekly review at 360 px the card's bottom is at 600 px and "Next: Mind sweep" starts at 611, before and after; the card's top moves from 430 to 478 px, so 48 px more of the step shows. The same at a list's end.

## Risks

- A person who always snoozes ten minutes taps twice instead of once on touch.
- The count is cut with an ellipsis where the two buttons leave it too little room (a long translation at 360 px); the card and the next reminder still say there are more.
