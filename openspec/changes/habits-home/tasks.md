# Tasks

## 1. Data model

- [ ] 1.1 Declare `user_prefs.habits` (string, default `""`), `task.habit_tiny` and `task.habit_anchor` (string, `Content: true`), `task.habit_graduated_at` (nullable timestamp) and `task.tiny` (bool) in `internal/sync/ops.go` with their comments; run `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema` and verify `web/src/generated/opSchema.ts` and the v1 surface snapshot change only by these additions (`go test ./...`)
- [ ] 1.2 Exclude `tiny` from the fields an occurrence record copies from its series (`recordFields` in `web/src/lib/recurring.ts` and its Go counterpart) and verify with a unit test on each side that a completion record of a tiny-free series has `tiny` false (`npm test`, `go test ./...`)
- [ ] 1.3 Add the effective-state rule (D1) to `web/src/lib/habits.ts` and a `useHabitsEnabled()` hook; verify unit tests for `""` with and without an open habit, `on`, `off` and an unknown value (`npm test` in web/)

## 2. Numbers

- [ ] 2.1 Extend `habitStats` with kept, strength, at risk and back on track over lineage-aware scheduled dates, tiny days counting as done (D4); add the vectors (60-day run with one miss, two misses, comeback, weekly, tiny, split lineage, graduation gap) to `web/src/lib/habits.vectors.json` and verify the vector test passes (`npm test`)
- [ ] 2.2 Document the measure, strength and states in `docs/recurrence.md` ("Habits") and verify `make docs-check`

## 3. Switch and placement

- [ ] 3.1 Add the **Habits** switch to Settings → Account → How you work, writing `habits`; turning on **Track as a habit** while not decided writes `habit` and `habits: "on"` in one batch and shows the one-time message; verify with component tests and the "Turned on by using it" scenario in a Playwright test
- [ ] 3.2 Gate every habit control on `useHabitsEnabled()` (Track as a habit, streak chip, task-page section, row and palette actions, Today strip, Habits destination, `g` then `Shift+H`); verify a test that renders Today, a project, a task page, the palette and the sidebar with `habits: "off"` and finds no habit control, and that completing a habit while off still writes its record
- [ ] 3.3 Document the switch in `docs/settings-you.md` ("How you work") and verify `make docs-check`

## 4. Habits screen

- [ ] 4.1 Build `web/src/app/habits/HabitsScreen.tsx` (lazy route, More destination, palette entry): groups by part of the day, rows with hue, title, anchor, thread, measure and check button, the folded Graduated group, the starters empty state; verify Storybook stories and a component test for the "A morning at a glance" scenario
- [ ] 4.2 Build `web/src/app/habits/Thread.tsx` (inline SVG, marks by shape, solid, dotted and absent lines, the thin at-risk line, announced days) with stories for every state in all built-in themes, light and dark, at 360 px; verify `make ui-check` and the accessibility gate after adding the screen to `scripts/ux-audit/screens.json`
- [ ] 4.3 Register `g` then `Shift+H`, Space and `Shift+Space` in the Habits scope of the shortcut registry; verify the registry's conflict test and `make docs` regenerates `docs/keyboard.md`
- [ ] 4.4 Play the check-in moment with the 400 ms token and the haptic tick, the end state under reduced motion; verify a test with `prefers-reduced-motion` and a visual-regression baseline of the end state

## 5. Today strip

- [ ] 5.1 Render the Habits strip as Today's first group and remove those habits from Today's other groups while on (`listGroups`); one line, two at most below 768 px, "+N" to Habits, foldable per device; verify unit tests for "No habit shown twice" and "A weekly habit on another day" and a 360 px screenshot test
- [ ] 5.2 Verify the Today limit still ignores habits and that Habits off restores habits as Today rows (`npm test`)

## 6. Creating habits

- [ ] 6.1 Build the New habit form (title, how often, tiny version, anchor, part of the day) used by New habit and Make it a habit, writing one batch with one Undo; verify component tests for the three Make it a habit cases in the spec
- [ ] 6.2 Add **Make it a habit** to the task row menu and the task page while on; verify it is absent while off or not decided
- [ ] 6.3 Write `docs/habits.md` (the screen, the strip, creating, the measure, tiny version, editing past days, graduating, the switch) and link it from `docs/recurring-and-reminders.md`; verify `make docs-check`

## 7. Tiny version, anchor and reminders

- [ ] 7.1 Add Log tiny version (check button menu, long press, `Shift+Space`) writing the completion batch with `tiny: true`; verify the "Tiny on one device, full on another" convergence test in `web/src/lib` (`npm test`)
- [ ] 7.2 Compose the reminder body from the tiny version on the device; verify the service-worker notification test shows "One page is enough"

## 8. Editing past days

- [ ] 8.1 Make `HabitHistory.tsx` and the thread open Done, Tiny, Skipped and Clear on editable past days, writing or tombstoning the record without moving the series; verify unit tests for "Fill in a forgotten day", "Clear a wrong tick" and "Edited on two devices", and keyboard access in a component test
- [ ] 8.2 Verify Completed and the `completed` filter follow a cleared day (`npm test`)

## 9. Graduation

- [ ] 9.1 Add Graduate and Resume (D7): Graduate writes `habit_graduated_at` and `until`, Resume splits the lineage from the next scheduled date on or after today; verify unit tests for "Floss has stuck" and "Resume after a month" (`npm test`)
- [ ] 9.2 Exclude graduated habits in the shared availability predicate in `web/src/lib/occurrences.ts` and its Go port, so reminders, projections and the Today limit skip them; verify `go test ./internal/recurrence ./internal/push` and the shared vectors

## 10. Release checks

- [ ] 10.1 Add the changelog fragment `changelog.d/Added/habits-home.md` and verify `make repo-check`
- [ ] 10.2 Record the side-by-side design review (D8) in `openspec/changes/habits-home/review.md`, with no product names on any page of the website
- [ ] 10.3 Run `make check` and verify it passes
