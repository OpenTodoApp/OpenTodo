# Proposal

## Why

Open Loops opens the day well (the Daily check picks today's focus, the Loop home says what the next move is) but never closes it. At the end of a day Today still lists what did not get done, and the only ways to clear it are to reschedule each task by hand or to let them pile up as Overdue and face them in the morning. The data to close a day cleanly is already on the device: what was planned, what was done, today's focus, the Today list and the bulk-action path that reschedules many tasks as one undoable batch. A short end-of-day step turns that into a habit: see how the day went, decide once per unfinished task, leave one line for tomorrow.

## What Changes

- A **Close the day** action, reachable from the end of the Today list, from the Review move on the Loop home, from the command palette and by `g` then `Shift+D` (free in `web/src/lib/shortcuts.ts`; `g` then `d` opens the Day calendar and `Shift+D` alone duplicates a task in a list, neither of which conflicts with a `g` sequence in the global scope).
- It opens a three-step screen at `/review/close` built with the weekly review's stepper (progress indicator, one step card, Back and Next, `[` and `]`):
  1. **How the day went**: planned (what Today listed), done today (with the definitions of Statistics), today's focus as "n of m done". Tracked time is not shown: no time-tracking capability exists yet; the summary leaves one line for it should one ship.
  2. **Carry over**: every unfinished task of Today with one decision per task, defaulting to **Tomorrow**: tomorrow, pick a day, Someday, or keep in Today. Applying writes ONE batch of operations through the bulk-actions path, so it is queued offline, converges per field and is undone in one step from the usual toast.
  3. **A line for tomorrow**: an optional one-line note.
- **Finishing** stamps `closed_at` on the user's `review` row and stores the note as `tomorrow_note`, both additive fields of the existing entity. The note is user-written content, so it joins the end-to-end encryption content fields; the stamp is not content.
- The Review entry's rhythm markers and the Loop home's Review move say **Day closed** for the rest of the local day, and the next morning's Daily check shows yesterday's note at the top until that day is closed again.
- No new dependency, route on the server, setting, icon or token. Statistics counts nothing new: a task rescheduled by Close the day is an ordinary reschedule, and the stamp and note are not statistics.

Out of scope: mood, energy or productivity scores; streaks of closed days or any history beyond the latest stamp; emails or the digest; notifications or a toast that nags to close the day; tracked time (no time-tracking change exists; see design); anything on the server beyond the two additive op fields and the content-field list; the CLI and MCP; changes to the Daily check's own steps, the weekly review or the Monthly look.

Advances ROADMAP.md: `open-loops-method` (the rhythms of the method) and `stats-and-review` (the review record).

No new environment variable. The op log format gains two additive fields on `review` and loses nothing. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `weekly-review`: new requirements for Close the day (where it is reachable; the three steps; the day's summary; the carry-over decisions; the one batch and its undo; the close write; its sync and convergence), each with offline and convergence behaviour; "Finishing a review" gains `closed_at` and `tomorrow_note` with the rule that the note is content; "Daily check" shows yesterday's note; "Rhythm markers" adds the "Day closed" state.
- `open-loops`: the "Loop home" requirement's Review move shows whether the day is closed and offers Close the day.
- `end-to-end-encryption`: "Encrypted and plaintext fields" adds the tomorrow note to the encrypted text of the personal scope.

## Impact

- Server: `internal/sync/ops.go` `Schema["review"]` gains `closed_at` (number) and `tomorrow_note` (string); `internal/e2ee` `ContentFields["review"] = {"tomorrow_note"}`; the shared fixture `internal/sync/testdata/schema_fixture.json`. No handler, route, migration or job: the entity already syncs, exports and purges through the existing paths, and the digest reads only `completed_at`.
- Web app: `web/src/lib/types.ts` (`Review`), `web/src/lib/ops.ts` (`REVIEW_DEFAULTS`), `web/src/lib/e2ee.ts` (`CONTENT_FIELDS.review`), `web/src/lib/review.ts` (the day's summary, the carry-over plan, `closeDay`, `dayClosed`, `yesterdaysNote`), a new `web/src/app/review/CloseDay.tsx` in the review chunk, `ReviewProgress.tsx` and the step card made reusable, `web/src/app/TaskListView.tsx` (the row at the end of Today), `web/src/app/method/LoopHome.tsx` (the Review move), `web/src/app/Sidebar.tsx` (the marker), `web/src/app/review/DailyCheck.tsx` (yesterday's note), `web/src/lib/shortcuts.ts` (`go.close`, `close.tomorrow`, `close.pick`, `close.someday`, `close.keep`), `web/src/app/palette/registry.ts`, `web/src/app/Shell.tsx` (the `close` step), stories and tests, strings in the five translated catalogs.
- Docs: `docs/method/rhythms.md` (a "Close the day" section and the due table), `docs/today-and-upcoming.md` (the row at the end of Today), `docs/keyboard.md` (generated), `CHANGELOG.md`.
- Bundle: about +3 KB gzipped in the lazily loaded review chunk and under 0.5 KB in the main bundle (the Today row, the shortcut rows, the palette command). Binary size unchanged apart from a few bytes of schema. No new dependency.
