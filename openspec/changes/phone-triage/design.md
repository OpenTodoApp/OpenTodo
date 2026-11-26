# Design

## Context

`TriageView.tsx` is one component for two places: the screen at `/triage` and the card inside the Open Loops home's Clarify move (`TriageCard`). It has no breakpoint. Its decisions are a `flex-wrap` toolbar of `Button size="sm"` with a key each; Move, Delegate and Labels are `Dialog`s in the default placement (full screen below 640 px), and Move's dialog holds a `ProjectPickerField`, a button that opens a second picker. Only Schedule is a sheet already (`ScheduleSheet`, `placement="sheet"`).

The screen was looked at on a build at 390 by 844 px with touch before anything was designed.

## Goals / Non-Goals

**Goals:** below 768 px, the decisions in one fixed place a thumb reaches, the two swipes a phone list has, pickers as sheets; every decision kept; the same operations.

**Non-goals:** any change from 768 px or for a mouse; the keys; what is written; the queue; the scheduling sheet's content.

## Decisions

**D1. Which decisions are in the bar.** Row one is Today, Schedule, Move, Complete, More: the four answers to "when or where does this go, or is it done", the ones a person gives for most tasks. Row two is Back and Skip: they walk the queue and decide nothing, so they are apart from the decisions and at the two ends of the row, where either thumb finds them. Delegate, Labels, Someday, Open and Trash are in More: Delegate is disabled for most people (it needs a shared project), Labels does not advance, Open leaves the card, Trash is the one destructive choice and is better one tap further away. First considered: one row of seven. Rejected: at 360 px a target would be 51 px wide and "Überspringen" or "Verschieben" would not fit.

**D2. Pinned by `position: sticky`, not `fixed`.** On a phone the page (`PageBody`) becomes a column at least as tall as the content scroller, and the bar is its last child with `margin-top: auto` and `sticky; bottom: 0`. So the bar sits on the tab bar when the card is short, the card scrolls above it when it is long, and nothing has to know the tab bar's height, which changes as it minimises. It is how the phone task page pins its composer. A `fixed` bar would need a measured spacer under the card and would leave the scroller's box.

**D3. No floating add button.** The bar is the screen's own action, so `/triage` joins the screens of `app-shell` "No floating add button in the rituals" (`VIEW_QUICK_ADD.triage = false`; the map is read only for the phone's button). Capture stays one tap away: Back, or the Inbox tab. The toast is lifted above the bar with the variable the selection bar uses (`--selection-lift`), set from the bar's measured height while it is pinned.

**D4. The swipes are the task row's.** `useRowSwipe` on the card: towards the end completes, towards the start opens the scheduling sheet, with the row's distances, edge and click swallowing. A person learns one gesture for the whole app. A deck-of-cards swipe (right keeps, left skips) was considered and rejected: the same movement would complete a task in every list and skip it here, and an accidental completion in a list is what its Undo is for, while a mis-read "skip" here would silently leave tasks unsorted. It is on below 768 px with a coarse pointer; a press in the focused title field never starts one.

**D5. Sheets.** `Dialog placement="bottom"` below 768 px for Move, Delegate and Labels (the centred dialog from 768 px, as today). On a phone Move renders the project list itself (`ComboboxPanel` over `projectSource` without the Inbox entry, which did nothing here) instead of the field that opens a second picker. `ComboboxPanel` already leaves the keyboard closed on a touch-only device (`autoFocus="keyboard"`).

**D6. One component for the bar.** `TriageBar.tsx` draws the toolbar from the list of decisions `Triage` already builds: the wrapping row from 768 px (the markup as before), the two rows and the menu below. The decisions' `run` functions are the ones the keys call, so there is one path to every write.

**D7. Data model, budget, size.** No op field, no route, no server change; nothing is written that was not written before. No dependency: image size and memory unchanged. Interface budget (`docs/interface-guide.md`): the screen has one row of chrome (the header), no list, no new sidebar destination, no new shortcut; the content scroller stays the one vertical scroll region (a sheet's list is an overlay); the bar's targets are 48 px. The code lands in the triage's lazy chunk; `scripts/bundle-budget.mjs` is the check.

## Risks / Trade-offs

- **The bar takes about 100 px of a small screen.** → At 360 by 640 px about 330 px are left for the card, which scrolls; the header's large title scrolls away first.
- **A swipe on the card where the notes hold a wide table or code block that scrolls sideways.** → The gesture locks only after 12 px of sideways travel with less than 8 px of vertical travel, as in the lists; a block that scrolls sideways inside the notes would still lose the gesture to the card. Not seen in the seed; recorded for the trial.
- **Happy-dom has no layout.** → The tests assert structure and writes; the pinned place, the 48 px targets and the absence of sideways scroll are checked in a real browser at 390 px.

## Migration Plan

One pull request. No data migration. Reverting is reverting the commits.

## Open Questions

- Whether the owner wants Skip as a swipe after all (D4).
- On a phone Open leaves the triage for the task page, and coming back starts the queue again from the Inbox as it then is. That is how it was before this change; keeping the place in the queue across the task page would be a change of its own.
