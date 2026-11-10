# Design

## Context

The device already works out both figures. A parent's progress is `progressMap` in `web/src/lib/subtasks.ts`: direct, non-deleted subtasks, built once per task snapshot and patched from the rows each write changed (`liveProgress`, incremental-list-updates D2). Rows read it by id. A project's progress is `summarizeProjects` in `web/src/lib/projectHealth.ts` (statistics "Project health"), shown as a `ProgressRing` and a percentage in the All projects table. This change shows those figures in more places. It adds no new notion of progress.

## Decisions

### D1. Direct subtasks, as the count already counts

A parent's share is its direct, non-deleted subtasks done over all of them, the same `done/total` the row's "1/4" shows today. A subtask's own subtasks give that subtask its own share; they don't add to the parent's. A completed parent keeps the share of its subtasks (completing a parent completes them, so it is normally 100%). A deleted subtask counts nowhere.

*Alternatives.* Counting every descendant would make "1/4" and the ring disagree, or change a count people know. Weighting by estimate would need estimates on every subtask and reads as precision the data doesn't have.

### D2. Rows and cards: a 12 px ring before the count

At row size a ring reads better than a bar. It sits in the run of marks after the title like the icons of the other counts (notes, comments, attachments), at their 12 px. A bar needs a width to mean anything: at 16 px the difference between 1/3 and 1/2 is two pixels, and a longer bar would push the counts into the property column of the row grid (sidebar-brand-and-row-grid D2). The ring takes the counts' own colour (faint, then muted on hover or focus), never the accent, so a list of parents stays calm. The visible count stays "1/4" with no percentage: in a row the ring is the at-a-glance share and the count the exact one. The ring is decorative (`aria-hidden`); assistive technology reads "1 of 4 subtasks completed" as before. On a card the ring replaces the check icon that led the progress item.

`ProgressRing` gets a `size` of 12 or 14; it draws the same 14-unit view box at either size. `ToneText` gets a `leading` mark for the card, so the card's item keeps its tone, truncation and spoken label.

*Alternatives.* A percentage in the row ("25%") is a third number on a row that already has a count. A thin bar under the title was rejected for the grid reason above.

### D3. The task panel: the percentage after the bar

The Subtasks heading already has "1 of 4" and a 64 px accent bar (sidebar-brand-and-row-grid D7). It ends with the percentage in faint tabular figures, in a fixed width so the bar doesn't move as the number grows. This is the one place a task shows the percentage the reporter asked for, at a size where it is legible. The assistant's task block, which has no bar, puts the 12 px ring before its "1 of 4".

### D4. The project page: ring and percentage beside the title

The project's line beside its title (the page header's lead) starts with the 14 px accent ring and "40%", read "40% done", exactly as the All projects table shows it. On a phone the title bar's plain line reads "40% done" first. The figure is the project's own tasks, every level of subtask included, by the rule of statistics "Project health": completed over completed and open (deferred and someday included), a recurring series once through its open task, deleted, skipped and sample tasks left out. An area shows none, as in the table. A project without a counted task shows none. The page lists the project's own tasks, so the figure leaves out sub-projects. That is the table's figure for an unfolded row.

The rule is `progressPart` in `web/src/lib/progress.ts`, used by both `summarizeProjects` and the page, so the two can't drift. All projects is unchanged.

*Alternatives.* Rolling up sub-projects would show a figure that isn't the list under it. A bar under the title would add a row of chrome above the list.

### D5. Performance at 10,000 tasks

A row reads its parent's figure from `liveProgress` by id, as it does today: O(1) per row, and O(changed rows) per write. The ring is one small SVG on the rows that have subtasks. The project figure is `projectProgressOf`, a per-snapshot map over the snapshot every screen already shares (`perList`). It is built once in O(n) and then patched from each write's changed rows, like `openCountsByProject`, so the header costs O(changes) per write, not a scan. The randomized equivalence test (`incrementalEquivalence.test.ts`) checks the patched map against a full count after every random write. No new module-level state.

### D6. No agent tools, MCP or CLI figures

The server and the CLI don't show subtask counts today. Adding a percentage there would need a Go port of the rule with shared vectors, and the figure is cheap for an agent to work out from `list_tasks`. That isn't trivial, so they are left out.

## Data model, size, interface budget

- **Data model:** none. No op field and nothing stored. Progress is derived from `parent_id`, `completed_at`, `deleted_at`, `series_id`, `skipped`, `sample` and `project_id`. It converges because those do. It works offline because it is read from local rows.
- **Size:** first-load gzip measured with `make bundle-budget` against `origin/main` (c8b9536): entry 142.9 KB before and after; entry and its static imports 682.5 KB before, 683.0 KB after (+0.5 KB, most of it the hash churn of the changed chunks). `ProgressRing` was already in the first load. No budget change, no dependency, no change to binary or container size or runtime memory beyond one map per snapshot (one entry per project).
- **Interface budget:** no new row of chrome (the project figure joins the existing lead line), no new task property (the ring joins the existing count), no sidebar destination, no scroll region, no shortcut.

## Risks / Trade-offs

- **The ring's track is faint at the faint colour.** The arc carries the value, and the count beside it is the exact figure. The ring doesn't need its own contrast because it is decorative.
- **100% under a completed parent.** It reads as it should. A parent completed on another device while a subtask was added here keeps that subtask open. That subtask then shows at the top level (subtasks "Completing a parent"), so the share doesn't hide it.

## Follow-ups

- CalDAV `PERCENT-COMPLETE`: the VTODO export could write the subtask share (and 100 when completed). Reading it back would bring back the hand-set progress this change leaves out, so the import would ignore it.
- A manual slider, if people still ask for one after using this.
