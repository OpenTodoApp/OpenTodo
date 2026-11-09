# Design

## Context

A project list is derived in `web/src/lib/listGroups.ts`: `treeParts` splits the open tasks with `splitLater` (a whole subtree goes where its top-level task goes), builds the tree of the active ones and buckets its roots by section; `listGroups` turns them into groups in one linear pass, appending one `later` group built from the Later tasks. `patchTreeParts` follows a write row by row (incremental-list-updates D2) and returns null, for a full derivation, when a task's parent, position, section, project or start changes.

## Decisions

### D1. Later inside its section, after the active tasks
In a list grouped by section, `listGroups` emits, after each section's group, a group `later:<section key>` with `laterOf` set to the section key, holding that section's Later subtrees. Its section is the section of the top-level task (so subtasks follow their parent, subtasks-follow-later); a section that is not one of the project's live sections reads as "No section", as for active tasks. "No section" is listed when it has active or Later tasks. `GroupedList` draws the group inside its `SectionGroup`, after the rows (and after revealed completed tasks), with `ListGroupHeader` as a plain heading (`bar={false}`, level 3): the section's bar stays the only bar, so the Later heading reads as part of the section, not as another section. Rows of the Later group stay a group of their own in `groups`, so keyboard order (rows are the groups' rows in order), `siblingPositions`, row motion and `keepGroups` work unchanged.

Rejected: rows of both kinds in one group with a split index. It would make every consumer of `rows` and sibling positions aware of the split.

### D2. Folded by default, per device
A section's Later uses the folded-group machinery of Today's Blocked group: `folded`, `count` and `openKey`, with the open state in the per-device collapse set under `project:<id>:later:<section key>:open`. Folded, it has no rows, so `j`/`k` skip its tasks; the count still says they are there. A collapsed section hides its Later as well. The trade-off: parking the selected task with `n` in a sectioned project takes it into a folded Later, so the selection leaves it (the count rises); `n` again needs the Later opened. Opening it automatically would tie the pure grouping to the selection and was left out.

### D3. Drag and sections
`sectionOfRows` maps a Later group's top-level rows to its section, so dropping a task beside a Later row places it in that section, as beside an active row. Dropping on the section (its heading or body, which includes the Later) moves the task to the end of that section as before. Manual order among the active tasks is unchanged.

### D4. One Later group elsewhere
A project without sections, grouping by None, Due date, Priority or Label, and the project timeline keep the single Later group at the end. Without sections the end of the list is already the only area, so the same group serves; other groupings have no section to keep a task in; the timeline lists every task by its dates and would lose deferred ones behind a fold. The board already keeps cards in their columns. The display screen keeps its own Later group.

### D5. Same linear pass, same incremental path
The Later tasks' tree is built once per derivation, as before, and its roots are bucketed by section in one pass (`laterBySection`); the section loop then takes each section's Later from a map. `TreeParts` and `patchTreeParts` are unchanged: a write that changes a task's start or section is still worked out in full, any other write to a Later task is patched and the groups are drawn again from the patched parts. The randomized equivalence test now also compares the groups drawn from patched and full parts with every section's Later open.

## Data model and sync

None. The grouping is computed on the device from local data, so it is the same offline and follows synced changes; the fold state is a per-device preference, never synced. A 1.0 client keeps its own single Later group for the same tasks.

## Interface budget

No new chrome above the list, no task property, destination, scroll region or shortcut. The Later heading is one quiet line inside a section, only when the section holds Later tasks. No new string ("Later" exists).

## Size

About 0.3 KB gzip of first-load JS (measured 692.3 KB, from 692.0 KB on main), no dependency, no CSS; the budget goes to 693 KB. The grouping runs with every project list, which is in the first load with TaskListView, so it cannot be lazy.
