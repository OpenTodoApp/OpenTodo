# Implementation notes

## Status (2026-10-16)

Implemented on `feat/habits`: the two schema fields, the habit skip record, the
server and client occurrence counts, `lib/habits.ts` with its vectors, the
`HabitHistory` grid and story, the habit switch and streak line in
`RecurrenceField`, the streak chip on rows (Today, Upcoming, projects, labels,
the Filter view and saved views), the `habit` filter keyword (also added to the Go
parser in `internal/filter`, which validates saved views and runs the docs
examples), and the docs.

## Decisions taken while implementing

- **History starts at the first record.** Without a lower bound every scheduled
  day before the habit existed would read as missed. The grid and the streak treat
  days before the series' earliest occurrence record (or its current occurrence
  when it has none) as outside the history, so they are blank. This is a pure
  function of the rows, so devices still agree; `created_at` was not used because
  its local date depends on the device's zone. Documented in `docs/recurrence.md`
  "Habits" and pinned by the vectors ("a new habit with no records has no
  history").
- **Records are derived-id records only.** Like `completedOccurrences`, the
  history counts live, completed rows whose id is `occurrenceId(series, date)`;
  detached copies and reopened records are not days of the habit.
- **`habitStats` takes the task list, not pre-filtered records**, and returns
  `null` for a task without a calendar rule or a due date. `habitStatsMap` groups
  rows by `series_id` once per list for the chips (design D5).
- **Done glyph colour.** Design D4 named `text-on-accent` on `bg-success`; that
  pair is 1.92:1 in dark (the dark success green is bright). The check is drawn in
  the `surface` colour instead (white in light, near-black in dark), and
  `pairs.ts` gains `GLYPH_PAIRS`: `surface` on `success` and `danger` on
  `danger-soft` (the missed cell's dashed border), checked by `contrast.test.ts`
  in both themes and every accent. They are a separate list because the Colours
  story renders every entry of `PAIRS` as a labelled swatch in body text, which
  axe rejects on a green background (and would have changed that story's
  baseline). Skipped uses `border-input` (the design's `border-muted` is not a
  token).
- **Day numbers.** Cells without a glyph (missed, upcoming, unscheduled) show the
  day of the month in the hint size, so the grid can be read without a screen
  reader; the number is `aria-hidden` and the accessible name carries the date.
- **Home and End** go to the first and last day of the month (not of the week
  row); arrows past the month's edge turn the month.
- **Filter evaluation.** `completed` excludes skipped records as designed, and the
  evaluator also drops skipped records from any query that names `completed` or
  `open` (so `!open` or `completed | open` cannot list them), matching the spec's
  "SHALL match neither". The project list's "n completed" reveal skips them too.
- **`kBool` now refuses `null`.** `json.Unmarshal` leaves a Go bool untouched on
  `null`, so every boolean field accepted it. The spec requires `null` to be
  invalid for `habit` and `skipped`; the fix applies to every `kBool` field
  (`archived`, `evening`, `pinned`, `encrypted`), none of which any client writes
  as null. All Go tests pass.
- **Icons.** `flame` was already in the sprite (used by the project icon set); only
  `minus` was added, regenerated with `scripts/icons-sync.mjs` from lucide-static
  1.48.0. `minus` was a website-only icon in `site-icons.json`; it is removed
  there, since the site bundle now takes it from the app sprite (the
  site-bundle test refuses duplicates).

## Verification

- Go: `go vet ./...`, `go test ./...` (new: `internal/sync/habits_test.go`,
  `internal/httpapi/habits_test.go` for REST and CalDAV,
  `TestHabitInResults` in `internal/agenttools`, the activity fixture case).
- Web: `npm run typecheck`, `npm test` (new: `lib/habits.test.ts` with
  `habits.vectors.json`, `lib/habitSkip.test.ts`, filter cases in
  `lib/filter/filter.test.ts`, `app/habits.test.tsx` with axe), `npm run
  docs:check`, `npm run build`; `make ui-lint`; OpenSpec validate.
- `make ui-check`: the workbench builds and the axe gate (`a11y.mjs`) passes on
  every story in light and dark, including the two new habit history stories. The
  visual-regression half cannot be verified here: run against the committed
  baselines in this container, unchanged stories (Colours, Icons size scale, Page
  header) also differ by 1–3 %, because baselines only match inside the pinned
  Playwright image (no Docker daemon here). New baselines are needed for
  `screens-habit-history--*` and for `foundations-icons--all` (the sprite gained
  `minus`); generate them with the "UI baselines" workflow or `make ui-baselines`
  and commit them.

## Archive (2026-10-16)

Merging the deltas as written made four live requirements longer than the strict
validator's 500 characters, and the extra "Older client keeps the flags" scenario
in task-management "Task fields" broke the in-flight `custom-fields` change, whose
MODIFIED block of that requirement must list every current scenario. The merged
behaviour was therefore split out instead of appended, with no change in meaning:

- task-management: "Task fields" is back to its previous text and scenarios; the
  new "Habit fields" requirement holds the two booleans, their defaults, the
  invalid values and the older-client scenario.
- filter-queries: "Priority, state and search terms" is unchanged; the new "Habit
  terms" requirement holds `habit` and the skipped-record exclusion.
- recurring-tasks: "End conditions" is unchanged; "Skip an occurrence" keeps the
  non-habit sentence; the new "Skipping a habit" requirement holds the skip record
  and its exclusion from `for N times`, with both habit scenarios.

## Smoke test (task 5.1 substitute)

There is no second device or adjustable clock here, so the manual run was
replaced by:

- A throwaway `./bin/opentodo` with a fresh data directory: register, create a
  token, `POST /api/v1/tasks` with `every weekday` and `"habit": true` (returned
  `habit: true`), `PATCH` with `"habit": "yes"` (400), `PATCH` with `completed_at`
  (the series moved to the next weekday and kept `habit: true`; one occurrence
  record for today with `skipped` false).
- Two-device behaviour (skip on both, complete on one and skip on the other, the
  streak after a server completion syncs) is covered by `lib/habitSkip.test.ts`,
  which runs two IndexedDB stores and relays their op logs, and by the vectors.
- The grid at 360 px in light and dark was rendered from the Storybook build in
  headless Chromium: no horizontal scroll (page width 360), every state readable
  in both themes, the axe gate clean.
