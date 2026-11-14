# Proposal

## Why

A habit is more than a tick. People want to write why they started, what the plan is, and a line about how today went ("5k, knee a bit sore"), and they want that writing next to the rest of their notes. Research on personal informatics (the CHI work on lived informatics and reflective tracking) finds that a short reflection is what makes tracking worth keeping, and Notion-style trackers are popular for exactly that, at the cost of building it by hand. OpenTodo already has the parts: every task has a note, `[[` links notes, tasks and projects, and Linked references show what points where. Habits should use them fully.

## What Changes

- **The habit's note.** A habit's own note (its task note) opens at the top of its page: why, the plan, the rules. It is written, linked and searched like any task note.
- **A note on each check-in.** After checking in, a quiet "How did it go?" line opens in place; typing keeps a short note on that day's occurrence record, skipping it writes nothing. The note can be added or changed later from the thread or the month grid. A habit's records no longer copy the habit's own note, so the day's note starts empty.
- **Check-ins on the habit's page.** Days with a note show a small mark in the thread and the grid; the page lists them as **Check-ins**, newest first, each with its date and state.
- **Habits in links.** The `[[` picker lists habits as habits (the habit mark and the measure); a link to a habit shows the mark. A habit's page shows Linked references like any task, so a "Running plan" note and a "Physio advice" note sit one tap away.
- **Make habits from a note.** On check-list lines of a note (the same command as Make tasks), **Make habits** creates one habit per line, reading a repeat rule from the line or using `every day`, and turns each line into a link to its habit.
- **Habits in the weekly review.** While Habits is on, the review's Look back shows each habit's week: its thread, kept and the week's check-in notes.

Not **BREAKING**: no new op field (a check-in note is the record's existing note field), no route, no environment variable.

Out of scope: mood or rating scales; showing habits inside daily notes (links and routines do that once `daily-notes` and `habits-assistant` land); attachments on a check-in; the assistant reading check-in notes (`habits-assistant`).

Builds on `habits-home` (the Habits screen, the thread, editing past days) and `note-checklist-tasks` (Make tasks from check-list lines). Archive after both.

Roadmap: the "Habits area" in ROADMAP.md.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `habits`: the habit's note on its page, a note per check-in, check-ins listed on the page, records no longer copying the habit's note.
- `note-links`: habits shown as habits in the picker and in rendered links.
- `rich-text-editing`: Make habits from check-list lines.
- `weekly-review`: each habit's week in Look back.

## Impact

- Web: `web/src/lib/recurring.ts` and its Go counterpart (a habit's record copies no `description`), the check-in line on the Habits screen, the strip and the task page, `web/src/app/habits/CheckIns.tsx`, the link picker and link rendering, the Make habits command in the editor, the weekly review's Look back step.
- Server: the completion record's field copy in `internal/sync` (no `description` for a habit's record).
- Docs: `docs/habits.md`, `docs/note-links.md`, `docs/notes-to-tasks.md`, `docs/weekly-review.md`.
- Size: under 1 KB gzip on the first load (the check-in line); the rest loads with the Habits and editor chunks.
