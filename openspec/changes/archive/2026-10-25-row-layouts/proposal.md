# One-line and detailed rows

## Why

Issue #367: the one-line row (Precision rows, 0.12.0) hides details as the list narrows, so reviewing tasks by do date, start, deadline, priority and project means opening each task. A task with more than two labels shows "+n". Priority is shown only by the colour of the checkbox ring (and priority 3 not at all), which people with colour vision deficiencies cannot tell apart.

## What Changes

- A second row layout, **Detailed**: the title, the parent task when it is not shown above, then one details line with the do date and time, the priority (bars and "P1"–"P3"), the deadline, the start, the project, the estimate, the assignee and the other facts, and the labels on one line, as many as fit, then "+n". It wraps on a phone or at a large text size.
- **One line** stays the default and unchanged, except that a priority 1–3 task now shows a priority mark after its title: bars in the priority colour, a different number per level, read as "Priority n". Priority is never colour alone.
- **Where it is chosen:** Settings › Appearance › **Task rows** sets the account's layout, used by Today, Upcoming, the Inbox, search and every list without its own choice. The **Display options** of a saved view, the New view page, a project and a label get **One line** / **Detailed** at the top, stored with that view, project (personal prefs row) or label.
- New interface icons `signal-high`, `signal-medium`, `signal-low`, `rows-2`, `rows-3` (lucide-static 1.48.0, already the icon source).

Not **BREAKING**: additive op fields (`user_prefs.row_layout`, `view.row_layout`, `project_prefs.row_layout`, `label.row_layout`); the retired `row_detail` stays retired. The REST views API accepts `row_layout`.

Out of scope: more layouts (cards in lists, two-line compact), a layout for board cards or the Plan's compact rows, per-device layouts. Advances the ROADMAP's "views and display" line.

## Impact

- Server: `internal/sync/ops.go` Schema and fixture, `internal/httpapi/views.go`.
- Web: `lib/rowLayout.ts` (new), `listDisplay.ts`, `views.ts`, `types.ts`, `ops.ts`; `TaskRow`, `ui/Chips` (`LabelChips fit`), `views/DisplayPanel`, `SavedViewView`, `FilterView`, `task-list/*`, `AppearanceSection`, `index.css`; icons.
- Six-language strings for One line, Detailed, Rows, Task rows and the settings copy.
- Docs: `docs/row-layouts.md` (new, with screenshots), `settings-you.md`, `filters.md`, `api.md`, `sync.md`; CHANGELOG.
