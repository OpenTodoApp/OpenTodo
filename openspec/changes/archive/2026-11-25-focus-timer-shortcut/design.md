# Design: focus-timer-shortcut

## D1. Which entry is the session's

The indicator already reads the running entry (`useRunning`). It also reads the device's Focus row (`useFocusState`, the copy every screen reads, kept in step across devices by `focus_run`). The entry is the session's when the session is in a running work stretch (`phase` `work`, `resumedAt` set) on the entry's task and its `entryId` is the entry's id, or not yet recorded (the moment between starting the entry and storing its id). Any other entry opens the task as before.

## D2. One destination per width

- From 768 px the pill's body navigates to `/focus`, which shows the running session (`focusTarget`); Stop inside the pill is unchanged. The icon rail's menu offers "Go to Focus" in place of "Open the tracked task", since Focus shows the task.
- Below 768 px the bar's pill navigates to `/focus` directly rather than opening the sheet: the sheet's Open and Stop are both on the Focus screen, so a sheet would only add a step. It drops `aria-haspopup`, as it no longer opens a dialog.
- On the Focus screen itself activation changes nothing (`navigate` ignores the current path).

## D3. Name and look

The accessible name keeps the visible text (WCAG 2.5.3) and names the destination: "Go to Focus: 1:05 · Write the report", one new message beside the existing "Go to Focus". The controls are already buttons in the tab order with the token focus ring and touch-height targets; classes, icon and text are unchanged, so no Storybook baseline changes.

Data model: none; the indicator writes nothing and works offline from local rows. Bundle: no dependency; `lib/focus/state` is already in the shell's chunk (the break reminder). Interface budget: no new chrome, no new shortcut, no new scroll region.
