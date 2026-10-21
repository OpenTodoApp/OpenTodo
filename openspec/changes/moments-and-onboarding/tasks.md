## 1. Illustration set

- [ ] 1.1 Draw `today-clear`, `week-clear`, `project-new`, `day-done` and `trash-empty` as components in `web/src/ui/illustrations/` following the briefs in design D1 (one 1.5 px stroke, round caps, `currentColor`, the sunken fill, one accent shape at 15 %), register them in `Illustration.tsx`; verify `make ui-lint` passes (no hex, no image, under 4 KB each) and `ls -l` shows each file under 4 KB
- [ ] 1.2 Add each to `Illustrations.stories.tsx` in light and dark; verify `npm run build-storybook` and the a11y gate pass, and the five render at 375 and 1280 px with no horizontal scroll
- [ ] 1.3 Name the illustrations from the empty views of Today, Upcoming, a project with no open task, the Trash and Done for today (`EmptyState illustration=`), with a type error on an unknown name; verify with happy-dom tests in `web/src/app/emptyViews.test.tsx` that each view renders its drawing hidden from assistive technology and the sentence as the heading (`npm test`)
- [ ] 1.4 Add the briefs to `docs/design-system.md` under Illustrations; verify `make docs-check`

## 2. Sample tasks

- [ ] 2.1 Add `task.sample` (bool, additive, not content) to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify `go test ./internal/sync/...` (an op with `sample: true` is accepted, an older server fixture rejects it as unknown and the device keeps its value) and `npm test` (defaults)
- [ ] 2.2 Replace "Show me around" in `web/src/app/FirstRun.tsx` with "Start with three sample tasks" on the first step: three Inbox tasks per design D2 (notes, due today 10:00 with 15 m, one subtask), created as ordinary ops, the offer recorded once per account; verify `firstRun.test.tsx` covers "Take the offer", "Offered once" and that no label or project is created
- [ ] 2.3 Show the muted word "Sample" in a sample task's metadata line and the panel notice "A sample task · Remove sample tasks"; add "Remove sample tasks" to the Inbox header's overflow while any sample exists, trashing every `sample` task as one batch through the bulk undo path; verify `taskRow.test.tsx`, `taskDetail` tests and a new `sampleTasks.test.tsx` ("Remove in one tap" with Undo restoring the edited title), and `budget.test.tsx` still passes (the word appears only on sample tasks)
- [ ] 2.4 Exclude `sample` rows in the shared statistics predicate (device `web/src/lib/stats`, server `internal/digest` and the Loop pulse) and add a sample row to the shared fixture; verify `npm test -- stats loop` and `go test ./internal/digest/... ./internal/stats/...` evaluate the fixture identically ("Sample task excluded", "First week with samples")
- [ ] 2.5 Update `docs/your-first-task.md` (the sample tasks replace the sample project), `docs/statistics.md` (excluded rows); verify `make docs-check`

## 3. First-day checklist

- [ ] 3.1 Add `user_prefs.start_checklist` (additive, `hidden`) to the Schema, `types.ts`, `ops.ts` and `web/src/lib/userPrefs.ts`; verify `go test ./internal/sync/...` and `npm test -- userPrefs`
- [ ] 3.2 Build the "Your first day" view as the start guide's last view with the three steps read from local data (a non-sample task exists; a user-set due date or Today opened after the first task; installed or a second device in the sync state), each with its action, and "Remove sample tasks" while samples exist; verify `firstRun.test.tsx` ("Steps tick from data", "Done", "Second device counts")
- [ ] 3.3 Add the "Start guide · n of 3 done" entry to the sidebar's More group with Hide in its menu, absent on the demo, leaving when done or hidden; verify `sidebar.test.tsx` (entry, count, Hide writes the preference, gone after sync in a second db) and `budget.test.tsx` (primary destinations unchanged)
- [ ] 3.4 Stories `Screens/First run/Your first day` at 375 and 1280 px in both themes; verify `make ui-check` once baselines are generated with the UI baselines workflow (CI's ui-check artifact or `make ui-baselines` with Docker)

## 4. Done for today

- [ ] 4.1 Show the final state in `web/src/app/review/CloseDay.tsx` after the close writes (illustration, time, figures line, quoted note, "Back to Today" focused, "Reopen the day" where offered), device state only; verify `closeDay.test.tsx` ("Close with carry-over", "Nothing was planned", "Reload" shows the first step)
- [ ] 4.2 Reduced motion: the state appears with a crossfade only; verify the motion test in `closeDay.test.tsx` under `prefers-reduced-motion`
- [ ] 4.3 Story `Screens/Close the day/Done for today` in both themes at 375 and 1280 px; verify `make ui-check` once baselines exist
- [ ] 4.4 After `close-the-day` is archived, amend the one clause "and then return to the Today view" of weekly-review "Closing the day" in `openspec/specs/weekly-review/spec.md` to "and then show the Done for today state"; verify `make openspec-validate`
- [ ] 4.5 Update `docs/method/rhythms.md` (Close the day ends on Done for today); verify `make docs-check`

## 5. Command bar

- [ ] 5.1 Add the segmented control (Search, Add, Commands, Ask when available) and the `+`, `>`, `?` prefix rules to `web/src/app/palette/CommandPalette.tsx` per design D7, with Escape returning to Search first; verify `palette.test.tsx` ("Prefix switches the mode", "Ask only when available", second prefix press keeps the character)
- [ ] 5.2 Add mode: mount `QuickAdd` inside the bar with the opening screen's defaults, Enter adds and clears, the "Added to …" toast; verify `palette.test.tsx` ("Add from Settings", "Add in a project", "Offline")
- [ ] 5.3 "Add '<text>' as a task" as the last Search entry with `Ctrl`/`⌘`+`Enter`; verify `palette.test.tsx` ("Last entry" is never first, "Ctrl+Enter")
- [ ] 5.4 Ask mode hands the text to the assistant panel as one turn and is absent without the assistant; verify `palette.test.tsx` and `askEntry.test.tsx` ("Ask", "Typing sends nothing", "Member without the assistant")
- [ ] 5.5 Widen the scope of `list.quick-add` (`q`) in `web/src/lib/shortcuts.ts` so that on screens without a quick add it opens the bar in Add mode; verify the registry conflict test and `shortcuts.test.ts` ("q where there is no quick add": Settings and Week open the bar, Today focuses the line)
- [ ] 5.6 Hint line while the field is empty names the three prefixes; cheat sheet and `docs/search.md`, `docs/quick-add.md` updated; verify `shortcutHelp.test.tsx` and `make docs-check`
- [ ] 5.7 Stories `Screens/Command bar` (Search, Add with chips, Commands, Ask) at 375 and 1280 px in both themes; verify `make ui-check` once baselines exist

## 6. Inline highlighting and the toast primitive

- [ ] 6.1 Add the highlight layer behind the quick add's `<input>` in `web/src/app/QuickAdd.tsx` (same font and padding, scrolls with the field, `aria-hidden`, soft colour per attribute, a 1 px underline under high contrast, no tint on a dismissed span or a quoted phrase); verify `quickAdd.test.tsx` ("Chips appear as tokens are typed" with tints, "Dismissing … no tint", "Quoted phrase", "Screen reader", "High contrast") and `npm run build`
- [ ] 6.2 Implement the toast primitive in `web/src/ui/overlay/Toasts.tsx` and `web/src/app/bulk/UndoToast.tsx`: one toast, replacement, 5 s and 10 s, pause on hover and focus-within, Tab reach, no auto focus, opposite corner on overlap, scroll padding so the focused element stays above it, fade only under reduced motion; verify `bulk.test.tsx` and a new `toast.test.tsx` ("Pause on hover", "Focused row stays visible", "Replacement", "Keyboard", "Reduced motion")
- [ ] 6.3 Stories `Overlay/Toast` (single action, batch with two controls, phone) in both themes; verify `make ui-check` once baselines exist

## 7. Translations, size and release

- [ ] 7.1 Translate every new string (sample task titles and notes at most 50 and 200 characters, the checklist, Done for today, the bar's segments and hint, the toast sentences) in the five catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 7.2 Check the sample titles and the Done for today line in German and Portuguese at 375 px through the workbench language switch; verify by eye that no title wraps to a third line
- [ ] 7.3 Regenerate the affected screenshots with `make docs-screenshots` (`today` empty, `quick-add`, `close-day`, `review`); verify `make docs-check`
- [ ] 7.4 Add this change as a row of ROADMAP.md "Next: Design refresh" ("Moments and onboarding") and the CHANGELOG.md entry under Unreleased naming the sample field and the preference as additive
- [ ] 7.5 Measure the main bundle before and after (`npm run build` output) and record the illustration, highlight-layer and checklist growth in design D12; verify the growth is under 10 KB gzipped
- [ ] 7.6 Run `make check` and verify it passes before marking this task done
