## Context

Ten small changes, picked by one rule from the owner's review: each removes something from the screen or shortens it, and none adds a mode or a control to learn. Two first ideas were dropped because the app already does them: the completion's check, strike and collapse (`[data-departing]` in `index.css`), and Done today folded by default (`DONE_OPEN_KEY`).

## Decisions

**D1. Chips, not tiles.** `FactChips` draws a wrapping row of pill buttons (icon and name, 40 px tall with a 44 px target) instead of the three-column grid of 72 px tiles (phone-modern-look D4). The row ends with `AttachMenu`, given a chip trigger; the paperclip under the note goes. The menu's own Attach stays.

**D2. The task bar.** `PhoneTaskView` drops the position title and the two arrows. `TaskActionsMenu` takes an optional `step` (`hasPrev`, `hasNext`, `onStep`, `position`) and leads with Next task and Previous task, the position as their description. The keyboard's `j` and `k` are unchanged. The desktop page passes no `step`.

**D3. Display options in the menu.** Inside `DisplayInMenuContext`, `DisplayPanel` draws no button and opens when `requestDisplayOptions()` is called (a window event, like `requestAttach`), anchored to the menu's button that has focus then. `usePhoneListActions` takes `displayInMenu`; on a phone it adds a Display options item to the overflow and wraps the slot in that context. Completed keeps its own button, which is a different panel.

**D4. The briefing on a phone Today.** `PhoneList` passes Today's briefing through `withoutLate`: the late facts go, and a `today` briefing with no fact left becomes null, so the line goes (the meta line still says the date and the planned time). `done` and `clear` briefings are unchanged.

**D5. One Reschedule control.** `EarlierActions` takes `compact`: one menu button, Reschedule, with `RescheduleChoices` (Today first). The phone passes `compact`; the desktop is unchanged.

**D6. The Done today card.** It is a button while `done > 0` and Today shows the Done today group (a setting, off by default): it opens the Done today group (`toggleCollapsed(DONE_OPEN_KEY)` when it is folded) and scrolls to `[data-group="done"]` on the next frame.

**D7. Yesterday.** `describeDue` returns the local `date` too; the phone row's fact says Yesterday (with the time) for the day before today. Other overdue days keep the compact date.

**D8. The tab bar.** The current tab shows no count (its screen lists them) and no count in its name. A fixed, non-interactive layer under the bar fades from the page's background to transparent, at the bar's height plus the safe area, below 768 px only.

**D9. Zero totals.** `dayTotalsText` leaves out a zero half: "3h planned", "20m tracked", or nothing. This changes the desktop header in the same way.

**D10. Archive order.** `phone-delight` also modifies "Phone navigation"; this change's copy starts from its text, so archive `phone-delight` first.

## Risks / Trade-offs

- Next and Previous are one tap further away on a phone. The swipe-back edge and `j`/`k` stay; the person who steps through a list is rare on a phone.
- The display options lose their one-tap button on a phone; they are a setting changed rarely.
