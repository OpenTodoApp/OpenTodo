# Design

## Context

The round-2 mock-up `projects-table.png` and the build plan in `design-references/round2/README.md` (row 8) define the page. `precision-shell` gives the page the full content surface and the compact tool header. `precision-rows` set the pattern this follows: a size container whose columns drop from the end.

The page today (`app/ProjectsView.tsx`, from `sidebar-favourites`) has these parts:
- the tree with fold controls;
- a find field that keeps ancestors;
- per-row menus;
- open counts by the sidebar's rule;
- New project and From a template;
- the archived projects in a disclosure.

All of it stays. The tree becomes a table, and the disclosure becomes a tab.

## Decisions

### D1. Figures per row follow the sidebar's fold rule

A row's figures can cover the project alone or the project with its sub-projects. The page takes the sidebar's rule (project-organization "Open task counts"): a folded row sums its live, unarchived sub-projects, and an expanded row counts its own tasks.

- **No double counting:** with the tree open, a sub-project's tasks would otherwise count on its row and on its parent's.
- **Consistent with the sidebar:** the Open column matches the sidebar's count for the same fold state.
- **Applies to every figure:** health, progress, next due and updated follow the same rule as Open, so one row never mixes scopes.
- **While the find field narrows the tree,** nothing is folded, so every row counts its own tasks.

Archived and trashed sub-projects add nothing, as they add nothing to counts today. A cycle from concurrent moves is not followed.

### D2. Health: four words from explicit rules, the first that holds

The rules run on a project's counted tasks: live, not a skipped habit occurrence, not a start guide sample. These are the statistics' "Excluded rows". Of those, the open tasks include deferred and someday tasks.

| Order | Word | Rule | Detail |
|---|---|---|---|
| 1 | Late | an open task's deadline is before today | the task's title when there is one; else "n past their deadline" |
| 2 | Slipping | an open task's due date is before today | "n late" |
| 3 | Quiet | no change to the project or its tasks for 7 days | "n days" |
| 4 | On track | otherwise, with at least one open task | none |
| – | (none) | nothing open | "Nothing open" |

- **Why these four:** they are the mock-up's words, and each maps to one thing the user can do next: deal with the deadline, reschedule, decide whether the project is still alive, or nothing.
- **Order:** Late outranks Slipping because a deadline is a commitment and a due date is a plan. Slipping outranks Quiet because a late task is something to act on, and silence is only a hint.
- **"Today"** is the user's logical day (day start included). A deadline today is not late.
- **"Change":** the newest timestamp in the row clocks of the project and its tasks. The clocks are synced, so every device sees the same value. Completed tasks count as changes, so ticking a task wakes a quiet project.
- **The 7-day threshold** is a constant (`QUIET_DAYS`), not a setting. Note it for review.
- **The note under the table** says that health is worked out on the device from late tasks, deadlines and recent activity, so the words are never a mystery.

### D3. Computed on the device, pure

`lib/projectHealth.ts` is a pure module: rows in, a summary per project out. It makes no request, writes nothing and keeps no cache, the same rule as `lib/stats.ts`.

- **Input:** the page reads every task row (`useAllTaskRows`, the Statistics screen's source), because progress needs completed tasks.
- **Sameness:** two synced devices hold the same rows and clocks, so they show the same words. Only "Updated" depends on the moment it is read: it is re-read every minute.
- **Server:** no Go port. Nothing on the server needs health: the digest and the agent tools are unchanged.

### D4. Sorting keeps the tree

- **Siblings only:** a header sorts the projects among their siblings, at every level, so a sub-project never leaves its parent.
- **Three states:** the first click sorts in the column's natural direction (health from the most urgent, Updated from the newest, everything else ascending). The second reverses it. The third returns to the user's own order: positions and Move up / Move down.
- **Missing values sort last in both directions:** no health, no progress, no due date. Ties fall back to the name.
- **Marking:** the sorted column carries `aria-sort` and an arrow.
- **Not kept:** the sort is page state and resets on reload. Note it for review.

### D5. Progress and people

- **Progress:** completed over completed plus open. A recurring series counts once, through its open task: its completed occurrence records are past turns, not tasks.
- **The ring:** a new `ProgressRing` primitive in `web/src/ui`. It is a 14 px SVG in the colour of its text, the accent by default, on a faint track of the same colour. It is decorative: the percentage beside it is what is read ("38% done").
- **People:** the members of a shared project, from the local membership cache, as avatars. It shows up to three, then "+n", and the whole group is read as the list of names. A project that is not shared shows nothing, so a shared project stands out. The mock-up shows the user's own avatar on a personal project; note it for review.

### D6. The table is a size container

- **Narrowing:** `@container/projects` on the wrapper; each column's cells carry the width they need.

  | Table width | Columns |
  |---|---|
  | under 36 rem | Name and Health (the word only) |
  | from 36 rem | + Open, and the health detail |
  | from 44 rem | + Next due |
  | from 52 rem | + Progress |
  | from 60 rem | + People |
  | from 68 rem | + Updated |

- **Columns:** fixed widths after the name, so values line up down the table.
- **Rows:** 44 px, the mock-up's height and the touch target size.
- **Markup:** a semantic `<table>` with column headers, so screen readers announce each cell with its column.
- **Why not CSS grid rows like `precision-rows`?** A list row has one title and a set of facts. A project row is a record with named columns that are sorted by their headers, which is what a table is for.

### D7. Tabs instead of the disclosure

- **The tabs:** "Active n" and "Archived n" use the `Tabs` primitive (roving focus, arrow keys), as the mock-up shows.
- **The Archived tab** holds the existing archived list with Restore, unchanged.
- **The fragment follows the tab** (`#archived`), so the Settings → Data link and a reload open the same tab.
- **Focus after Restore:** when the last archived project is restored, focus falls back to the selected tab instead of the old disclosure's summary.

## Keyboard

The rows use the list's keys:
- Up and Down, with `j` and `k`, move between rows; Home and End go to the first and last.
- Left folds a row, or moves to its parent; Right unfolds it.
- Enter opens the project.
- Down from the find field moves into the table.

The keys are handled on the table's body while a row's open button has focus. They are not global shortcuts, so the shortcut registry is unchanged and nothing conflicts.

## Interface budget

- **Chrome above the first row:** the tool header, then the tab row with the find field under it. That is the header plus one row of controls, as before: the find field already sat above the tree.
- **Properties per row:** six facts, within the budget of seven.
- **Scroll regions:** one, the page.
- **Sidebar destinations and shortcuts:** unchanged.

## Data model and size

- **Data model:** none. No field, no op, no migration.
- **Bundle:** about 3 KB of JS before compression, and three icons of about 0.4 KB.
- **Image and memory:** no dependency. The page now reads completed task rows, which the Statistics screen already reads, so memory grows with completed tasks while the page is open. That is the same cost as Statistics.

## Risks

- **A large account (thousands of completed tasks):** the summary is one pass over the rows per change, the same work Statistics does. It is memoised on the rows, the fold state, the day and the minute.
- **Health words can mislead:** a project that is only waiting on someone looks Quiet. The note under the table, and the rules being few and plain, are the mitigation.
