# Design

## Context

Observed (`CloseDay.tsx`):
- `PageHeader` "Close the day", a progress stepper and one step card with Back and Next.
- **Step 1, How the day went** (`SummaryStep`): "You planned N tasks and finished M", plus the focus line.
- **Step 2, Carry over:** one `CarryCard` per task with five decisions (Tomorrow default, Pick a day, Someday, Keep in Today, Done already; keys `t` `p` `y` `h` `d`), with `CarryList` of every decision below it. Leaving the step runs `applyCarryOver` as one bulk batch with its own toast and Undo.
- **Step 3, A note for tomorrow morning:** one line with a preview. "Close the day" writes `closed_at`, `closed_day` and `tomorrow_note`, then `DoneForToday`.

Data:
- The `review` entity holds `closed_at`, `closed_day`, `tomorrow_note` (content, encrypted), `carry_over` (JSON `{date, items:[{id, field, before, after}]}`), `focus_date` and `focus` (the Daily check's focus: a date and up to three ids) and `focus_slots`.
- Reopen the day restores the recorded task fields and clears the stamp.

## Goals / Non-Goals

**Goals:**
- One step at a time, each with one job.
- A list instead of a card carousel.
- One-tap bulk.
- One write and one Undo for the whole close.
- A concrete first thing for tomorrow.

**Non-Goals:**
- New decisions.
- Changing the Daily check or its focus model.
- Statistics.

## Decisions

**D1. Steps.**
- The steps are Done, What moves and Tomorrow's first thing.
- The stepper stays (three named dots that fit 375 px), but the card surface goes. Each step is a titled section in the page column, with Back and Next at its end and "Close the day" as a secondary action on steps 1 and 2 and the primary action on step 3.
- Focus moves to each step's title, as today.

```
 Close the day                                   ● ○ ○
 ───────────────────────────────────────────────────────
 Done                                    5 of 8 · focus 2 of 3
   ✓ Send the invoice to Ana
   ✓ Book the dentist
   ✓ …
                                   Close the day    [ Next ]
```

**D2. Done is a list, not a sentence.**
- The tasks completed on the day being closed, in completion order, as compact read-only rows (the review rows of `task-list-presentation`), with the figures as the section's lead line.
- More than eight rows fold into "and n more", which opens in place.
- Nothing is written.
- Alternative considered: keeping the sentence. Rejected: what you did is what a ritual should show, and the figures alone read as a report.

**D3. What moves is one list with a decision per row.**

```
 What moves                                      All to tomorrow
   Call the plumber            [Tomorrow | Later | Someday]  ⋯
   Draft the newsletter        [Tomorrow | Later | Someday]  ⋯
   Renew passport · Fri 13     [Tomorrow | Later | Someday]  ⋯
                                   Close the day    [ Next ]
```

- Each row shows the title, the project and why it is in Today.
- The row's segmented choice is Tomorrow (the default, selected), Later (opens the date dialog, after which the row shows the chosen date) and Someday.
- The row's menu holds Keep in Today and Done already. A read-only task shows "Keeps its place" and no choice.
- "All to tomorrow" in the section's lead resets every row to Tomorrow.
- Keys: `j` and `k` move the row cursor, `t`, `p`, `y`, `h` and `d` set the cursor row's decision and move to the next row, and `Shift+T` does All to tomorrow. They are registered in the close-the-day scope, with a check against the registry.
- Alternatives considered:
  - Keeping one card at a time. Rejected: it hides the size of the evening, and every decision costs a step.
  - Five equal buttons per row. Rejected: three cover nearly every case, and the other two are in the menu.

**D4. Tomorrow's first thing.**
- The list offers tomorrow's tasks: due tomorrow, including the ones step 2 is moving there, in Today's order.
- Choosing one (Enter or a click, as a radio list) makes it tomorrow's first thing. The one-line note field stays under the list for anything that is not a task ("Call Ana first").
- Writing: the first thing is written as tomorrow's focus (`focus_date` = the next logical day, `focus` = its id, `focus_slots` = ""). Tomorrow's Daily check and the Focus screen then start from it, and a 1.0 client reads it the same way, as tomorrow's focus.
- Alternatives considered:
  - A new `tomorrow_first` field. Rejected: the focus already means "what today starts with". A second field would compete with it on the Daily check.
  - Only the free-text note. Rejected: a task can be opened, focused and ticked.

**D5. One write at close, one Undo (recommended).**
- Decisions are device state until "Close the day".
- The close writes ONE batch through the bulk path:
  - the carry-over task operations;
  - the focus fields;
  - `closed_at` and `closed_day`;
  - `tomorrow_note`;
  - `carry_over` with its items and, when D4 wrote the focus, a `focus` key holding the three focus fields as they were before.
- The toast reads "Day closed · 3 moved to tomorrow" with Undo. Undo is Reopen the day: it puts the recorded task fields back unless changed since, restores the focus from the record, clears the stamp and keeps the note.
- Leaving the screen before closing writes nothing.
- Alternative considered: writing on leaving step 2, as today. Rejected: two Undos for one act, and a half-closed evening when the user stops at step 3.

## Data model

- No new field.
- `carry_over`'s JSON gains an optional `focus: {focus_date, focus, focus_slots}` with the values from before the close. These are ids and dates only, never content, so it stays unencrypted.
- Readers that do not know the key ignore it. Such a reader's Reopen leaves tomorrow's focus as seeded and restores everything else, which is harmless: the focus of a day still to come.
- No op schema change, so `TestGeneratedOpSchema` is untouched.

## Interface budget

- The screen keeps one header row and the stepper inside it.
- One scroll region (the content column).
- Rows show at most title, project and reason.
- No sidebar change.
- New shortcuts: `j`/`k` and `Shift+T` in the close-the-day scope, registered without conflict.

## Size

No dependency. Neutral to slightly smaller (the card view goes). The review chunk is lazy, and the first load is untouched.

## Risks / Trade-offs

- [A user closes the tab at step 3 and expects the moves to have happened] → the stepper's What moves dot reads "not yet moved" until the close, and the entry row on Today still offers "Close the day".
- [Seeding tomorrow's focus overwrites a focus someone already chose for tomorrow on another device] → D4 reads the current focus first. When `focus_date` is already tomorrow, the pick is added as the first id, keeping at most three.
- [Large evenings of 30 or more tasks] → the list is virtualized like every list, and All to tomorrow keeps it one tap.

## Migration Plan

UI and one additive JSON key. Rollback is a revert. Records written with the key stay readable by the old code, which ignores it.

## Open questions for the owner

1. **What does "drop" mean?** Recommendation: Someday, shown with the word "Someday". It parks the task without a date, and it is reversible from the Someday list. Never move it to the Trash from a ritual, where a mis-tap would delete work.
2. **Should tomorrow's first thing also pin the task to the top of tomorrow's Today**, beyond seeding the focus? Recommendation: no. The focus already leads the Daily check and the Focus screen, and reordering Today would be a second, hidden effect of one choice.
3. **Should step 1 offer "Log a win"** (from `today-closed-list`) for things done but never written down? Recommendation: yes, but as a small follow-up once this ships. It would be one quiet "Add something you did" line at the end of the Done list, written as a logged win in the close batch. It is left out of these specs so this change stays the ritual alone.
