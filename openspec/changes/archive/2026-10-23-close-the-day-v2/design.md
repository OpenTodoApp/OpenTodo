# Design

## Context

Close the day (`close-the-day`, archived 2026-10-21) is a three-step screen at `/review/close` (`web/src/app/review/CloseDay.tsx`) on the weekly review's stepper. Its figures, carry-over list and close are computed from `useMethodInput()`, whose `today` is re-read every minute and at the day start; `closed_at` is the instant of the click, and "which day was closed" is derived when reading (`dayClosed`: the logical day of `closed_at`). The carry-over step lists full `TaskRow`s with four decision buttons each and a separate Apply; the row's checkbox completes the task immediately.

## Goals / Non-Goals

**Goals:** the day closed is the day the user started closing; Carry over readable and hard to get wrong; the stepper never shows work that is not left; a clearer third step; one calmer card per step.

**Non-Goals:** changing the weekly review or Daily check screens; a history of closed days; any server behaviour beyond one additive field.

## Decisions

### D1. Capture the day on opening; store it with the close

The screen keeps the first logical today it sees (`useRef`, set once `useMethodInput` has loaded) and builds every derived value from an input whose `today` is that day: `daySummary`, the "still open from earlier" count, `planCarryOver` (so "Tomorrow" is that day plus one) and the carry-over record's `date`. `closeDay(note, day, now)` writes `closed_at` (the instant, for "Day closed, 23:59" and ordering), `closed_day` (the captured date) and `tomorrow_note` as one op triple.

Reading goes through one helper, `closedDayOf(review)`: `closed_day` when it is a date, else the logical day of `closed_at` (closes written before this change, or a device whose server refused the field). `dayClosed`, `yesterdaysNote`, `canReopenDay` and the "Day closed" texts use it.

*Alternative rejected:* writing `closed_at` as the last millisecond of the captured day. It would make "Day closed, 00:02" read "23:59", lie in the export, and break the ordering of two closes by last-writer-wins on the stamp.

*Consequence:* a close finished after midnight for the previous day shows "Close the day" for the new day at the end of Today (the new day is not closed), offers no Reopen (the closed day has ended), and the note shows at the top of the new day's Daily check, which is the next morning the user wakes up to. Completions written by Done already carry the instant they are applied, so after midnight they count on the new day in Statistics (open question 3).

### D2. Carry over is a card per task

The step shows one unfinished task at a time, as Process the Inbox does (`TriageView.tsx`): a card with the title wrapped in full, the project, and how it came to be in Today ("Due today at 14:00", "Open since Monday", "Started today"), then a toolbar of the decisions with their keys, then the list of decisions so far.

- Decisions: Tomorrow (default), Pick a day (date dialog), Someday, Keep in Today, Done already; keys `t` `p` `y` `h` `d` on the card (`close.*` in the shortcut registry, view scope `review`; `d` is new as `close.done`).
- Choosing a decision records it and moves the card to the next task; after the last one the card says every task has a decision and offers Next.
- The list below (`data-carry-summary`) has one compact line per task: the title, cut to one line with the full text in the tooltip and accessible name, and its decision; activating a line brings that task back to the card. Tasks not decided yet show "Tomorrow" as the default in the list.
- A task the user may not edit offers Keep only and says why.
- No checkbox on the card or in the list: completing is the Done already decision, written with the batch.
- The card is selected by keyboard on entering the step: focus moves to the step title as before; the decision keys act on the card's task without selecting a row first.

*Alternative rejected:* a denser list with a decision menu per row. It still cuts titles and still puts five decisions behind a second click per task; five to ten tasks in the evening are faster one at a time.

### D3. Moving on writes the batch

Leaving Carry over forward (Next, `]`, or a later circle in the stepper) calls `applyCarryOver` with every task's decision, then moves. The Apply button, the "Applied / Not applied" badge and the count sentence's "Not applied yet" go. The stepper marks Carry over done whenever the user is past it or nothing is left to carry; the warning bubble shows only for a step the user has not reached.

Done already plans as the bulk "complete" does (`planComplete`: a repeating task rolls to its next occurrence, a task with subtasks completes them) and is part of the same batch, label and Undo.

Coming back to Carry over shows what is still in Today (the tasks carried over have left it) with their decisions; moving on again applies again. `applyCarryOver` joins the new items to a carry-over record of the same day instead of replacing it, so Reopen puts back both batches; each batch's Undo restores the record as it was before that batch.

### D4. A note for tomorrow morning

The third step is titled "A note for tomorrow morning". The field's label is "Note (optional)"; under it a live preview reads "Tomorrow your Daily check starts with: “…”" while something is typed, and "Leave it empty if there's nothing to remember." otherwise. Storage, length and encryption are unchanged.

### D5. One card per step

`StepCard` gains an opt-in `navInside`: Back and Next sit in the card's footer, separated by a hairline, instead of a row below the card. Close the day uses it; the weekly review keeps its current look (open question 1). How the day went is one sentence (`t.rich` with `<b>` around the numbers, so translations move the numbers freely) plus, when a focus was chosen, a second sentence for it; the three figure boxes go. Tokens only, the motion tokens for the card's step change (the existing focus move, no new animation), stories in both themes at 375 and 1280 px.

## Data model

`review` gains one additive field: `closed_day` (string, `YYYY-MM-DD`, "" = derive from `closed_at`). It is not user-written content (not in `e2ee.ContentFields`), syncs to the user's devices only, converges by last-writer-wins per field, is in the JSON export and derives no activity event. Reopen clears it with `closed_at`. `carry_over` keeps its shape; the record may now hold the items of more than one batch of the same date.

## Interface budget

No chrome is added above a list (the screen is not a list); the step card replaces the old card and its separate navigation row, so the screen has one fewer row. The card shows the title, project and why the task is in Today (three properties, within seven). One new shortcut, `close.done` (`d`, view scope `review`), registered without a conflict (the list scope's `d` for the deadline does not apply on this screen: Carry over has no list rows any more). No sidebar destination, no new scroll region. No new dependency; bundle impact a few hundred bytes in the review chunk.

## Risks / Trade-offs

- A device on an older version reads only `closed_at`: for a close finished after midnight it shows the new day as closed until both devices run this version. Acceptable: rare, self-correcting on upgrade.
- Applying on moving on removes an explicit "Apply" moment; Undo stays in the toast and `Ctrl`/`⌘`+`Z`, and Reopen covers the whole day.

## Open Questions

1. Should the weekly review and the Daily check also move Back and Next inside their card, so the review screens keep one look?
2. A close finished after midnight for the previous day offers no Reopen once the new day has begun. Should Reopen stay available until, say, the day start of the next day?
3. Done already after midnight stamps the completion on the new day. Should it stamp the end of the closed day instead, so Statistics counts it for the day being closed?
