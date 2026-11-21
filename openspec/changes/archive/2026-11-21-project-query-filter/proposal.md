# Proposal

## Why

On a project's board there is no quick way to narrow the cards. Someone coming from Kanboard wants a box at the top that matches titles, labels and priority as they type (GitHub issue [#1636](https://github.com/OpenTodoApp/OpenTodo/issues/1636)). Upcoming and the Calendar already have that filter: a query in the filter language, applied as you type, shown as one chip in the header.

## What Changes

- A project page in its List, Board and Timeline layouts offers the same query filter as Upcoming: **Filter…** in the page's Filter menu (and the phone's overflow), one chip with the query's words and a clear control in the header, label checkboxes in the dialog. `search: milk` narrows by title, `@label` by label, `p1` by priority.
- Each project has its own filter, remembered on this device and never synced.
- The dialog's hint gives `search:` as its first example, since a bare word is not a query.

Out of scope: a new filter language or a bare-word search; filtering a saved view's board (its query is the filter); syncing the filter.

Advances ROADMAP.md's boards line (sections-and-boards) without changing it.

## Design

- **D1 — The same filter.** `useListModel` gives a project route its own `useQueryFilter` key (`project.filter.<id>`, device meta, like `upcoming.filter`); the rest of the list chrome (the chip, Filter… under the duration filter, the phone item, the dialog) already handles a query filter, so nothing new is drawn. The dialog's title names the project.
- **D2 — What it narrows.** The filter narrows the project's tasks before rows, sections and board columns are built, as Upcoming's does: columns and sections stay, with fewer cards; counts follow the shown cards. A query without `completed` matches open tasks only, as the grammar says, so the board's Completed column is empty while such a filter is on. Adding a task that the filter hides keeps the filter, as on Upcoming. The Calendar layout keeps the Calendar's own filter (calendar-clarity), so a project shown as a calendar is filtered as the Calendar is.
- **D3 — The hint.** One sentence for every place: "for example search: milk & p1 or @errand".

Data model: none (device meta only). Interface budget: no new row of chrome; the chip sits in the header's actions, where Upcoming's does. No new shortcut.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `filter-queries`: a new requirement, "Query filter on a project".

## Impact

`web/src/app/task-list/useListModel.ts`, `listExtras.tsx`, `TaskListView.tsx`, `web/src/lib/deviceFilters.ts`, `web/src/app/calendar/QueryFilterDialog.tsx` and the locales; `docs/boards.md` or the projects guide; a changelog fragment.
