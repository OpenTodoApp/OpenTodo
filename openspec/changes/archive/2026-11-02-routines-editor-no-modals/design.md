# Design: no dialogs in the routine editor

## D1. One list pattern

The step catalogue and the trigger kinds reuse the list the word pickers already use (`web/src/ui` Combobox: `useCombobox`, `ComboboxField`, `ComboboxList`; `ChoicePopover` in `web/src/app/routines/pickers.tsx`), so there is no third pattern. The trigger list is a `ChoicePopover` anchored to the word's start edge. The catalogue is the same field and list rendered inline (not in a popover), because it is a bigger chooser that belongs in the flow of the steps: it expands where "+ Add step" was pressed and pushes the cards below it down. Its search keeps the catalogue's own matching (`searchKinds`: every query word anywhere in the name, description or synonyms, in the user's language and in English) by feeding the matches to the combobox as its entries; without a query the entries are the suggestions and then the groups, each under its heading.

## D2. Where the catalogue opens

The editor keeps one open place, `{parent, block, index}` (as before), plus the selector of what opened it. The card lists render the catalogue after the card at `index - 1` (Add step below) or after a list's "+ Add step" button (`index = -1`). Opening the same place again closes it. Picking inserts the step there and moves focus to its card; Escape and the close button collapse it and return focus to the opener. The panel carries `data-overlay="inline"` so the page's Escape (leave the routine) ignores it.

## D3. Trigger details in the card

`TriggerFields` (a kind select plus the kind's members) is split: the kind is the word's list, and `TriggerDetails` renders only the members inside the When card. A kind without members closes the list and returns focus to the word. The When card's condition uses the existing `Inspector` (in the card from 1024 px, a bottom sheet below) through a slot in the When card, as step cards do.

## D4. Deleting a step

A step is part of an unsaved draft, so its deletion is an editor edit: removed at once, announced, with a toast whose Undo re-inserts the same step at its old place (unless it is back already or its block is gone). This replaces the inline confirmation; Ctrl+Z still takes back the last edit.

## D5. Questions in place

The AI test question renders inside the Test panel (side column from 1024 px, Test tab below) with Test focused, Escape cancels. Describe it renders at the top of the Routines page body under the header with the field focused; Escape, Cancel and its close button collapse it and focus the Describe it button.

## Data model

None. No op, field, route or setting changes; nothing to converge.

## Size

No dependency. Web bundle: the editor chunk is lazy; it loses the `Dialog` sheet use and gains a small inline panel (a few hundred bytes gzip). The first-load budget is unaffected.

## Interface budget (docs/interface-guide.md)

No chrome is added above a list: the catalogue and Describe it appear only on demand inside the content column. The catalogue's list scrolls inside itself (one scroll region, as the word lists); no new shortcut (the existing `a` and Delete card keys keep their meaning, Delete no longer asks).
