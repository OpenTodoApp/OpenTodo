# Proposal

## Why

Ticking a task shows the "n selected" bar above the list and pushes every row down, so the next tap lands on the wrong row ([#1143](https://github.com/OpenTodoApp/OpenTodo/issues/1143)). A few other things appear above a list after it is on screen and move it the same way: the shell's notices (a removed start view, a change the server refused), the update prompt, and the Inbox's routines card, which loads after the list. On a phone the floating add button also sits over Focus and Close the day, two rituals meant to keep nothing else on screen, and Close the day draws a second divider under the shell's bar when it offers Reopen.

## What Changes

- The selection bar floats over the bottom of the content instead of standing above the list: on a phone just above the tab bar, where the add button stands (the button steps aside while the bar shows); on a computer over the bottom of the content surface, with a toast in the corner lifted above it. The content keeps room under its last row for the bar, and the keyboard cursor stays above it. Ticking or clearing never moves a row.
- The shell's notices become toasts, as `app-shell` "Notices are toasts" already requires; the update prompt and the refused-update notice float in the bottom corner as toasts too.
- The Inbox's routines card sits under the last task, where arriving late moves nothing.
- Focus and Close the day have no floating add button.
- On a phone, Close the day's Reopen stands in the page under the shell's bar, without a second divider.

No new field, route, string or environment variable; the op log format is not **BREAKING**.

## Capabilities

### New Capabilities

### Modified Capabilities

- `bulk-actions`: the selection bar floats over the bottom of the content.
- `app-shell`: nothing appears above a list after it is shown; no floating add button in Focus and Close the day.
- `routine-inbox`: the card sits under the Inbox's last task.

## Impact

- `web/src/app/bulk/BulkActions.tsx` (the bar), `app/Shell.tsx` (notices as toasts), `index.css` (the add button aside and the content's room while the bar shows), `app/task-list/revealRow.ts` (rows above the bar), `app/UpdateBanner.tsx`, `app/RefusedBanner.tsx`, `app/TaskListView.tsx` and `app/routines/` (the card's place), `app/router.ts` (`offersQuickAdd`), `app/review/CloseDay.tsx`.
- `docs/work-from-the-list.md` (where the bar is).
- No new dependency; the first load changes by a few hundred bytes.

Out of scope: Today's calendar agenda (it shows the events cached on the device with the list; a refresh that changes today's events changes the agenda itself), the demo banner (shown from the first paint), and moving notices other than these. Advances no open ROADMAP item.
