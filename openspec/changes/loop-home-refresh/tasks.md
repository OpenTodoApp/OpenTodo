# Tasks

## 1. Pulse functions

- [x] 1.1 Add `web/src/lib/method/pulse.ts` with `decided(tasks, today, days)`, `inboxAge(tasks, today)` and `nextMove(counts)` as pure functions over the rows, each with a doc comment naming the spec requirement; verify `npm test -- pulse` passes with the new `pulse.test.ts` covering the "Caught and decided" (deleted task in neither number), "Inbox age" (9 days, empty) and next-move order scenarios
- [x] 1.2 Add a `lastDays(today)` period helper that `compute()` accepts and a test proving its `perDay` has 14 entries ending on `today` and that "done this week" equals `compute()` for `periodFor('this-week')`; verify with `npm test -- pulse`

## 2. Loop home screen

- [x] 2.1 Rewrite `web/src/app/method/LoopHome.tsx` into the four parts (inline `QuickAdd`, the rail as a `ul` of links with numerals, the next move with the single primary button, done marks at zero, Today's focus with the ring, the Loop pulse) keeping `data-loop-tiles`, `data-loop-tile`, `data-loop-focus` and an `h2` per move; verify `npm run build` and `npm run lint` pass and no function exceeds 150 lines (`go test ./internal/codesize/...`)
- [x] 2.2 Update `loopHome.test.tsx` for the new behaviour: morning scenario reads counts from the moves' `aria-label`, Clarify is the next move with the one primary button and opens triage; add the "Capture from the Loop home" (task created, counts rise, focus stays), "Next move moves on", "Loop closed" (closed line, done marks, no disabled control) and "Phone width" (360 px, no horizontal scroll) scenarios plus the axe run; verify `npm test -- loopHome` passes
- [x] 2.3 Add the Loop pulse section to the screen and an `loopPulse.test.tsx` that renders the Shell with seeded tasks and checks "9 done this week" equals `compute()` for this week, the "11 of 18" text, the "empty" state and the sr-only list of fourteen values; verify `npm test -- loopPulse` passes
- [x] 2.4 Add any new foreground/background pair to `web/src/ui/tokens/pairs.ts` and verify `npm test -- contrast tokens` passes in both themes
- [x] 2.5 Add `web/src/app/method/loopHome.stories.tsx` ("Busy morning", "Loop closed") with `withClock`/`withSeed`; verify `npm run storybook` renders both and `make ui-check` passes once baselines are generated with the UI baselines workflow (new PNGs committed under `web/src/ui/__screenshots__/`)
- [x] 2.6 Replace the skeleton with one shaped like the final layout and verify by eye in Storybook (a "Loading" story) that the page does not shift when data arrives

## 3. Docs and spec

- [x] 3.1 Update `docs/method/overview.md` ("How prominent it is"), `docs/method/rhythms.md` (focus progress on the Loop home) and `docs/statistics.md` (the Loop pulse shares the statistics definitions); verify `make docs-check` passes
- [x] 3.2 Regenerate `docs/images/loop-light.webp` and `loop-dark.webp` with `make docs-screenshots` (the `loop` shot; its wait selector `[data-loop-tile="do"]` still matches) and verify the images show the new layout
- [x] 3.3 Run `make openspec-validate` and verify the change validates with `--strict`

## 4. Integration

- [x] 4.1 Run `make check` and verify it passes; add a CHANGELOG.md entry under Unreleased describing the Loop home refresh and the Loop pulse
