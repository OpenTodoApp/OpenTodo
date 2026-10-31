# Design: phone-touch-focus

## D1 Checkbox stacking, not a bigger box

The circle's button is already 44 × 44 px on a coarse pointer (`touch-target` with a −12 px margin around the 20 px slot), so neither the visible size nor the row height changes. Measured at 390 px in Chromium with touch emulation, a tap 8 px right of the circle landed on the open control whenever the open control had its own layer (a transform from the first-visit swipe hint or a returning swipe): a later sibling with a stacking context paints over the positioned checkbox slot. The checkbox slot gets `z-index: 1` on a coarse pointer, so the button wins its whole 44 px square. The overlap into the open control is the 4 px between the 8 px row gap and the button's 12 px reach; the title keeps the rest of the row. The collapse chevron and the selection box sit in their own slots as before; no drag grip is shown on touch rows.

The layout check gets `rowCheckReach`: on a coarse pointer, for each visible row, `elementFromPoint` 8 px left, right, above and below the circle must be the circle's button.

## D2 One set of focus rules

`web/src/lib/focusEdit.ts` holds what `f` did inside the Daily check: `pressFocus` (Three tasks: add, remove, refuse a fourth; Bento: `bentoPress` from `lib/bentoSlots.ts`), `placeFocus` (a chosen slot, `withPlaced`) and `estimateAndPlace` (Set estimate…, then place by it). Each takes a context (the review row, the preferences, today, the tasks it reads) and returns an outcome: done with its text and Undo id, refused with its text (and the task to offer Choose a slot for), or choose a slot. The Daily check, the picker and the menus call it and only decide how to show the outcome (the Daily check's status line, or a toast). Three tasks now writes through `applyBatch` like Bento, so it has Undo too; the stored fields and their meaning are unchanged.

## D3 Menus stay light, the picker is lazy

The entry chunk is at its budget. The menus need only whether the task is in today's stored focus and the focus style, which they read from the review row and preferences already in memory (`useReviewRow`, `useUserPrefsRow`). Selecting an item imports `focusEdit` and the picker lazily; the picker and its slot chooser load only when asked for, through a host the shell mounts once (the same pattern as the Frames dialog). From a menu the outcome is a toast with Undo; a refusal with a taken slot offers Choose a slot in the toast.

## D4 Picker candidates

Open, live tasks outside archived projects that are not already in today's focus. Two groups: Today (today's and overdue tasks in the Today order) and Other tasks. For a Bento slot, inside each group tasks whose estimate suggests that slot come first, then tasks without an estimate, then the rest; the estimate shows as the secondary text. Typing searches every candidate; the list shows at most 60 without a query. Choosing a task for an empty slot puts it in that slot (any estimate is allowed: the user chose it). Choosing from the Loop home or the Three tasks row goes through `pressFocus`, so Bento may then ask for a slot.

## D5 Interface budget

No new chrome above a list: the Daily check's Three tasks focus section shows its heading and an add row only (the section existed whenever it held a task). The empty slot row keeps its 44 px height and text, gains a plus icon at its end and becomes a button. Menus gain one item. No new shortcut; no new scroll region (the picker is a dialog, a bottom sheet below 640 px).

## Data model, size

No field or op changes. Bundle: the menu item and host add well under 1 KB to the entry chunk; the rules and picker load lazily.
