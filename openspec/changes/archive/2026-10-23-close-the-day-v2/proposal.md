# Proposal

## Why

Close the day works, but using it every evening shows four problems, one of them a bug:

- **The day being closed drifts.** Nothing is fixed when the screen opens: the figures, the carry-over and the close stamp all follow the live clock. A user who starts at 23:59 and finishes at 00:02 sees the figures switch to the new day mid-flow, "Tomorrow" moves tasks two days out, and the close is stamped on the new day, so the evening they meant to close is never marked closed and their line for tomorrow skips a morning.
- **Carry over is cramped and easy to get wrong.** Each unfinished task is a full task row with four buttons beside it, so a title is cut after a few characters. The row's checkbox completes the task at once, outside the batch the step is about, so a slip of the mouse closes a task that was meant to be carried over.
- **The stepper says work is left when it is not.** Decisions are only written by a separate Apply button; leaving the step without it leaves a warning count on step 2 while the user is on step 3, which reads as "tasks still to deal with".
- **"A line for tomorrow" is unclear,** and the three steps look like a form rather than an end-of-day moment: figures in three boxes, navigation below the card.

## What Changes

- **The day is fixed when Close the day opens.** The screen captures the user's logical today once and uses it for How the day went, the carry-over plan ("Tomorrow" is that day plus one), the carry-over record and the close. The close stores that date in a new additive field `closed_day` on the `review` row next to `closed_at`; "Day closed", Reopen and yesterday's line read `closed_day` when it is set and fall back to the logical day of `closed_at` for closes written by earlier versions.
- **Carry over, one task at a time,** like Process the Inbox: a card with the whole title, the project and when it was due, and five decisions: Tomorrow (the default), Pick a day, Someday, Keep in Today and **Done already**, on `t`, `p`, `y`, `h` and `d`. Choosing moves to the next task. A compact list of the decisions so far stays below the card; any of them can be opened again and changed. There is no checkbox: Done already is a decision like the others and is written with them. A task the user may not edit offers Keep only.
- **Moving on from Carry over applies it.** Next, `]` or a later step writes the decisions as the one undoable batch through the bulk path, as Apply did. The Apply button and the "Not applied" badge go; once the user is past Carry over its circle shows a check. Coming back and changing a decision applies the change the next time the user moves on, and the carry-over record keeps both batches so Reopen puts back everything.
- **Step 3 becomes "A note for tomorrow morning"** with a preview of where it appears: "Tomorrow your Daily check starts with: …".
- **A calmer layout:** one card per step with Back and Next inside it, and How the day went as one sentence with the numbers in bold ("You planned **8** tasks and finished **5**. **2 of 3** focus tasks are done.") instead of three boxes.

Out of scope: the weekly review and the Daily check (they keep their stepper and their navigation below the card; whether they follow is an owner question); mood, scores or streaks; notifications; the server beyond one additive op field; the CLI and MCP; tracked time in the summary.

Advances ROADMAP.md: `open-loops-method` (the end-of-day rhythm) and the usability feedback after the design refresh.

No new environment variable. The op log gains one additive field (`closed_day` on `review`) and loses nothing. Not **BREAKING**: an older server rejects the new field as unknown, the device keeps it, and other devices fall back to `closed_at`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `weekly-review`: "Close the day steps" (the day fixed on opening, the card with its navigation, the renamed third step), "How the day went" (one sentence), "Carry over unfinished tasks" (one task at a time, five decisions, no checkbox), "Carry-over is one batch" (written on moving on; a second batch on the same day joins the record), "Closing the day" and "Close record syncs and converges" (`closed_day`), "Daily check" (yesterday's line follows the closed day), "Reopen the day" (the closed day, both batches).

## Impact

- Server: `internal/sync/ops.go` `Schema["review"]` gains `closed_day` (string); the shared fixture `internal/sync/testdata/schema_fixture.json`. No handler, route, migration or job.
- Web app: `web/src/lib/types.ts` (`Review`), `web/src/lib/ops.ts` (`REVIEW_DEFAULTS`), `web/src/lib/review.ts` (`closedDayOf`, `dayClosed`, `yesterdaysNote`, `closeDay`, `planCarryOver` with Done already, `applyCarryOver` joining a same-day record, `reopenDay`), `web/src/lib/shortcuts.ts` (`close.done`), `web/src/app/review/CloseDay.tsx` (rewritten steps), `StepCard.tsx` (navigation inside the card, opt-in), `DoneForToday.tsx`, the callers of `dayClosed` (`CloseDayRow.tsx`, `Sidebar.tsx`, `method/LoopHome.tsx`), `review.stories.tsx`, tests, strings in the five translated catalogs.
- Docs: `docs/method/rhythms.md`, `docs/keyboard.md` (generated), `CHANGELOG.md`.
