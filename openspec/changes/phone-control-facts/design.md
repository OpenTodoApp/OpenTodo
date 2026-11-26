# Design

## Context

`Tooltip` (`web/src/ui/Tooltip.tsx`) opens on hover and on keyboard focus, never on touch. For a control that is right: the tap is the control's action. So whatever a control's tooltip says beyond the control's name has to be readable somewhere a tap reaches. The code already has ways to do that, and this change uses only those:

- the fact inside what the control opens (a dialog, a popover, a menu or its sheet), as a `MenuItem` `description`, a `MenuGroup` label or the sheet's title;
- a line under the control, drawn only where the tooltip is not (`LocationReminders` draws its line below `sm`);
- the word as a button with the detail below it on a tap (`HealthCell`);
- `FieldHint`.

Each case below was decided by reading what the control opens.

## Decisions: changed

**D1. Duplicate label (`LabelsView.tsx`, `Badge title`).** The badge is inside the button that opens the label, and the label's page says nothing about duplicates. The labels page has the banner, but the sidebar's drawer does not. The row already has a 44 px menu button, and its menu has **Merge into**, the remedy the tooltip names. `labelMenuGroups` takes `duplicate` and gives that item the tooltip's sentence as its `description`. No second target, no change in row height. The badge's word "duplicate" is already part of the row's accessible name.

**D2. Event lock reason (`EventBlock.tsx`).** A tap opens the details popover with `EventEditor`. It already shows "Not saved to your calendar" with Retry and Discard, and the reason for an event that can be neither changed nor deleted. For an event that can be deleted but not changed it showed only **Delete** (`AccessOf` in `internal/calsync/event_edit.go` returns `update: false, delete: true` with the read-only reason for a calendar that allows only deletion). The editor now shows the reason above Delete in that case.

**D3. Capped series (`PlanRow.tsx`, `projections.tsx`).** A tap opens the occurrence. The note is about the view (it draws at most 31 occurrences of a series per range), not about the occurrence, and the task page has no way to know the view's range, so the task page is the wrong place. The projection's own menu (right-click, Shift+F10, a long press on touch) is the surface the item owns: its items sit in a `MenuGroup` whose label is the note. The note also joins the item's hidden name, which a screen reader on a phone reads without the tooltip. A line in the row was rejected: Month and Plan rows are 24 px and must not grow. The cost: a long press is less obvious than a tap.

**D4. Skip and This occurrence only (`RecurrenceField.tsx`).** Each acts at once, so there is nothing to open. A `FieldHint` beside each would add two targets under 44 px next to the buttons. The field is a form section, not a row, so lines under the buttons break no stable height: a `dl` with each button's name and its tooltip's sentence, `pointer-fine:hidden`. With a mouse the tooltips stay and carry the shortcuts.

**D5. Origin that is not a link (`OriginChip.tsx`, `Menu tip`).** The chip opens a menu with Copy link. On a phone that menu is a sheet with a title, which was "From example.com", words the chip already shows. The menu's `title` is now the page's title when there is one.

**D6. Reactions (`ReactionBar.tsx`), found by this change's search.** A tap on a reaction toggles the viewer's own; who reacted was in the tooltip and the accessible name only. The six reactions are already menu items in the comment's **More actions** on touch and in Add reaction: each chosen one now has the names as its `description`.

## Decisions: no change

**D7. Published marker (`NoteEditor.tsx`, `TaskHead.tsx`).** The button opens the page dialog, which says "Anyone with the link can read the note, without an account. It is read-only." and, for a task, "Anyone with the link can open the page, without an account."

**D8. A saved view's error (`ViewsView.tsx`).** The button opens the view, which shows the query's error under its toolbar (`SavedViewView`, `message`).

**D9. Time zone that cannot be fixed (`ZoneControl.tsx`).** The button is disabled, and the reason is drawn as text beside it and is its `aria-describedby`. The app itself only uses the inline variant, which has no such state.

**D10. Origin chips that are links (`OriginChip.tsx`, `FacetLine.tsx`).** The tooltip is the title of the page the tap opens.

**D11. Compact date choices (`DatePicker.tsx`).** The tooltip is the date the chip stands for. The chip's accessible name has it, and a tap picks that date, which the calendar under the chips then marks.

**D12. Review status (`Sidebar.tsx`).** The entry carries the text as its description and the dot as its name. The Review page opens with "Last review …", and the More menu shows the text as the item's description.

**D13. Others the search found.** The urgency chip (a tap opens the breakdown), the tracking pill, a cut task, habit or attachment name (the tap opens the thing named), a Markdown link's address (the tap opens it), "+3 more overlapping items" (the tap lists them), Close the day's step dots (the tap opens the step), the workspace control's "Updates in …" (the menu marks each workspace that has updates), the sync dot (see the proposal).

## Data model

None. No field, no op, no stored preference. Everything is read from rows the screens already read, so it works offline and there is nothing to converge.

## Dependencies and size

No dependency. A few hundred bytes of script; the container image and runtime memory are unchanged.

## Interface budget

No row of chrome, no task property, no sidebar destination, no scroll region and no shortcut is added. Month and Plan rows, label rows and comment rows keep their heights. The two lines under Skip are inside the repeat editor of the When popover, drawn only without a fine pointer.
