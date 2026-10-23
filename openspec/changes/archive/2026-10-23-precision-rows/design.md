# Design

## Context

The round-2 mock-ups (`design-references/round2/`, `system.md` "Row", "Group bar", "Row actions", "Hidden note"; `today.png`, `project.png`) define the row. `precision-tokens` provides the surfaces (`--ot-hover`, `--ot-selected-row`, `bg-pop`, `border-strong`) and the 36 px row; `precision-shell` gives lists the full width of the content surface.

## Decisions

### D1. The row is its own size container; one DOM, two layouts

Each list row (`shape: 'row'`) is `@container/row`.

- **No JavaScript measuring:** the layout follows the row's own width, so the same list switches when the panel docks, in a dashboard panel, or on a phone, with no resize observer and no re-render.
- **One DOM:** the open button holds the head (the title, the repeat mark, the counts) and the line (`data-row-meta="row"`) with two wrappers: the column's cells (`data-row-props`) and the other facts (`data-row-rest`). Nothing is rendered twice, so tests and assistive technology see each value once.
- **Narrow rows (under 40 rem):** the wrappers are `display: contents`, so the line is one flex run as before; the dots are generated content and cross from the first wrapper to the second.
- **Wide rows:** the open button is a grid, `minmax(0, 1fr) auto`. The head is the first cell, the cells' wrapper the second, the line itself is `display: contents`, and the rest spans a second grid row only when it has items.
- **Why not duplicate markup with CSS switching?** Every value would be in the DOM twice (in jsdom both are "visible"), and the existing tests and screen reader output would double.
- **Why the row, not the list?** Every host of a row (Today, projects, saved views, the review screens, dashboards) gets the column without wiring. Inline-size containment is safe because a row is always as wide as its list.

### D2. The cells

- **Order:** date, project, third cell, estimate, assignee. Each cell has a named grid line, so a missing value keeps its track and every row lines up.
- **Widths:** date 5.75 rem, project 9.375 rem, third cell 6 rem (6.875 rem without a project cell), estimate 4 rem, assignee 1.25 rem, 0.75 rem apart. These are the mock-up's 92 / 150 / 96 / 64 / 20 px.
- **The template follows the list, not the task:** `showProject` decides whether the project track exists, so an Inbox task in Today lines up with project tasks.
- **The third cell** holds the labels, else the deadline, else the subtask progress (the mock-up's rule). A deadline that loses the cell to labels goes to the second line; progress in the cell leaves the counts.
- **Dropping by width:** 40–48 rem keeps date and project (or date and third cell without projects); 48–56 rem adds the third cell (or everything without projects); from 56 rem all five. The task panel shows every property.
- **Icons:** the date, estimate and progress cells carry their icons only in the column; in the narrow run they stay plain text, as before.
- **The assignee** shows its avatar in the column; the name is visually hidden there but still read out and in the tooltip.

### D3. The head

- **The repeat mark** is the repeat icon beside the title, read as "repeats" or "occurrence", in the faint tone, as in the mock-up.
- **The counts** (progress, notes, comments, attachments) move from the trailing group to beside the title. They keep their faint-to-muted behaviour on hover and focus, and stay inside the open button, so they are read with the title and are not a target.
- **The trailing group** keeps only the origin, a link that cannot sit inside the open button.

### D4. Neutral state colours and group bars

- **Selected row:** `--ot-selected-row` with the 2 px accent bar kept, the cue that does not rely on the surface step alone. Hover is `--ot-hover`.
- **Group bars:** `ListGroupHeader` becomes a filled bar by default: raised surface, 32 px, chip radius, label in medium weight and the default tone, sentence case for every group. Uppercase was a way to tell a generated group from a named one; the bar makes both read as structure, and the mock-up uses sentence case throughout.
- **Board columns** pass `bar={false}`, since the column is already the surface.
- **The display mode** keeps its own uppercase labels; its spec now says so directly.

### D5. The revealed actions float

- **The cluster** gets the popover surface, the strong line and the second elevation, and sits 1 px from the top of a 36 px row.
- **On a one-line row** it floats over the end of the column, so the row keeps no 7 rem of room for it (the CSS resets the trailing group's minimum width from 40 rem).
- **On a narrow row** the trailing group still reserves the room, so the cluster never covers the open control (audit M11).

### D6. The hidden note

- **What it says:** a project list in the list layout with "Show completed tasks" off and open tasks ends with "n completed tasks hidden by display options" and a Show link that turns the preference on (`saveShowCompleted`).
- **The empty project** keeps its existing "Show n completed" secondary action.
- **Naming:** the line names display options because `views-and-display` moves that preference into the display panel.

## Risks / Trade-offs

- **Dropped cells hide values at mid widths.** This is the mock-up's rule. The task panel and the narrow layout show everything.
- **Labels in a 6 rem cell are cut.** The chips cut with an ellipsis, and the full names stay in the tooltip and the accessible name.
- **A progress-only row** is two lines below 40 rem, where it used to show its progress in the trailing group.
- **Container queries** need Chromium 105, Safari 16 and Firefox 110, all within the supported browsers. Without them the row falls back to the narrow layout.

## Size

About 0.6 KB of CSS and 0.4 KB of JS, gzipped; no dependency.
