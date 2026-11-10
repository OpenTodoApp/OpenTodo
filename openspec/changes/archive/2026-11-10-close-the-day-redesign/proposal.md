# Proposal

## Why

Close the day (`web/src/app/CloseDayRow.tsx`, `web/src/app/review/CloseDay.tsx`) works, but the owner finds it basic and says it puts everything in front of you at once. In practice:

- The first step is a sentence of figures, not what you did.
- Carry over shows one card at a time with five equal decisions, with a list of every task under it.
- The last step is a free-text note.
- The decisions are written when you leave step 2, and the close is written at the end. So there are two separate Undos, and "Undo does not reopen the day" is a scenario in the spec.

An evening ritual should be calm, short and reversible as one act.

## What Changes

- **A three-step ritual, one step at a time:**
  1. **Done.** What you finished today, as a quiet list with the figures in one line.
  2. **What moves.** Every unfinished task of the day on one list, each with Tomorrow, Later or Someday. "All to tomorrow" is one tap, and the less common decisions (Keep in Today, Done already) are in each row's menu.
  3. **Tomorrow's first thing.** Pick the one task tomorrow starts with, and optionally a line for tomorrow (the existing `tomorrow_note`).
- **Keyboard first, skippable.**
  - `j` and `k` move between rows, and `t`, `p`, `y`, `h` and `d` keep their decisions.
  - `[` and `]` move between steps.
  - "Close the day" is available on every step, so the rest can be skipped. Undecided tasks take the default, Tomorrow, as they do today.
- **One write, one Undo.**
  - Nothing is written until "Close the day".
  - Then one batch holds the carry-over, tomorrow's first thing (seeded as tomorrow's focus through the existing `focus_date` and `focus` fields) and the close stamp.
  - The toast's Undo puts the whole evening back, and so does Reopen the day.
- **Done for today** keeps its calm final state and names tomorrow's first thing.
- The entry row at the end of Today, its words and `g` `Shift+D` are unchanged.
- No new op field, entity, route, setting or dependency. Not **BREAKING**.

The `carry_over` record gains an optional `focus` key with the focus fields as they were before the close, so Reopen can restore them. It is an additive key inside an existing JSON string. A client that does not know the key ignores it: such a client's Reopen leaves tomorrow's focus seeded and restores everything else.

Out of scope:
- The Daily check.
- The weekly and monthly reviews.
- Statistics.
- Mood or journaling.
- The Today closed list (`today-closed-list`).

Roadmap: the "UX polish (2026-11 feedback)" area of ROADMAP.md, row 4. It follows up `close-the-day` and `close-the-day-v2`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `weekly-review`: the Close the day steps and their contents, when the carry-over is written, closing with one Undo, Done for today, and a new requirement for tomorrow's first thing.

## Impact

- Web:
  - Restructured: `web/src/app/review/CloseDay.tsx` (steps, list, write at close).
  - Extended: `web/src/lib/review` (`applyCarryOver` and `closeDay` combined into one batch, and the `focus` key in `carry_over` with Reopen restoring it).
  - New: a small `CarryList` row with a segmented decision.
  - Updated: stories and the close-the-day tests, plus strings in every catalogue.
- Server: none. `carry_over` is a string field, and its JSON shape is read only on devices.
- Docs: `docs/method/rhythms.md` and `docs/today-and-upcoming.md` (Close the day) and the keyboard guide.
- Size: about neutral. The one-card view goes and the list stays. Off the first load (the review chunk is lazy), and the budget is unchanged.
