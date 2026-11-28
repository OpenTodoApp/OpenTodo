## Why

The redesigned phone lists lost the short swipe to edit a task's title (#2167), which the task-list-presentation spec already requires under **Touch title editing**. A full swipe still opens the date sheet. Restore the shorter gesture and make the two actions distinguishable while dragging.

## What changes

- On an editable phone list row, a short swipe toward the start of the line opens and focuses the existing title editor on release.
- Show a pencil with the localized **Edit** label on a soft blue background. A longer swipe switches to the existing calendar icon, **Schedule** label and accent background.

## Scope

This follows the [phone-lists roadmap entry](../../../ROADMAP.md). It applies to the phone lists now used below 768 px (#2159). Calendar and board gestures, right-swipe actions and row menus retain their existing behaviour.
