# Tasks

## 1. Records

- [ ] 1.1 Skip copying `description` and the note document into a habit's occurrence record in `web/src/lib/recurring.ts` and the server's completion in `internal/sync`; add the case to the shared occurrence fixtures and verify `go test ./internal/sync` and `npm test` in web/
- [ ] 1.2 Verify the "Completed on the server" scenario with an `internal/httpapi` test completing a habit through `/api/v1/tasks/{id}`

## 2. Check-in notes

- [ ] 2.1 Add the "How did it go?" line after a check-in on the Habits screen, the task page and the Today strip (popover), with Enter saving in its own batch and Escape writing nothing; verify component tests for "A line after the run" and "Nothing to say", and keyboard focus in a Playwright test
- [ ] 2.2 Add **Note** to past days in the thread and the month grid, asking for a state first on a day without a record; verify a component test for "A note for yesterday"
- [ ] 2.3 Verify a check-in note is found by note search with the habit's title and date, and that concurrent edits on two devices merge (`npm test`)

## 3. Check-ins on the page

- [ ] 3.1 Build `web/src/app/habits/CheckIns.tsx` and the note mark in the thread and grid, with the D1 filter for old copies; verify component tests for "A month of runs" and the announced "with a note", and Storybook stories in light and dark

## 4. Links

- [ ] 4.1 Show the habit mark and kept measure in the `[[` picker and the rendered link while Habits is on; verify component tests for "Link the habit from a plan" and "Off"

## 5. Make habits

- [ ] 5.1 Add **Make habits** next to Make tasks with the habit preset (D5), at most 50 lines, one Undo; verify tests for "A morning routine note", "A completion-relative line" and offline creation

## 6. Weekly review

- [ ] 6.1 Add the Habits section to the Look back step; verify component tests for "A Friday review" and "Habits off"

## 7. Docs and release

- [ ] 7.1 Update `docs/habits.md` (the habit's note, check-in notes, Check-ins), `docs/note-links.md`, `docs/notes-to-tasks.md` and `docs/weekly-review.md`; verify `make docs-check`
- [ ] 7.2 Add `changelog.d/Added/habit-notes.md` and verify `make repo-check`
- [ ] 7.3 Run `make check` and verify it passes
