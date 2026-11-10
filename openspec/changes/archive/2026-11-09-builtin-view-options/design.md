# Design

## Context

See proposal.md for why.

Projects and labels already have Display options (`list-display-options`). Their state lives in `web/src/lib/listDisplay.ts`: a `ListDisplay` of `groupBy`, `sortBy`, `sortDir` and `rowLayout`, read with a fallback to the page's default and written one op per field. `useListDisplay` puts the panel (`web/src/app/views/DisplayPanel.tsx`) in the header's `extra` slot and the phone bar's `extraSlot`, registers the `r` keys (`useDisplayKeys`) and switches back to manual order on a move. The panel already leaves out a part whose value is absent. Projects and labels do not get Layout, Completed tasks or Show on rows.

The built-in lists are built in `web/src/lib/listGroups.ts`:

- **Inbox** is a tree view (`treeView` in `useListModel`). It takes the same path as an ungrouped project: one group, top-level tasks in manual order, subtasks under them.
- **Today** is flat. `flatGroups` calls `todayGroups`, which splits the list with `groupToday` into Earlier, Today, Morning and Afternoon (day parts on), This Evening and Blocked. `closedListGroups` then adds Waiting for a slot and Done today. Rows come from `todayList`, sorted by `compareDueThenPriority`. The slots are filled by `useClosedList` from the whole of Today before any filter, in their own fill order.
- **Upcoming** is flat: one group per day from `groupUpcoming`. With Start with Today, Today's groups come first, built by the same `todayGroups`.

Project grouping already brings subtasks along with their top-level task and sorts top-level nodes only (`sortedRoots`). `buildTaskTree` (via `effectiveParents`) makes a task top-level when its parent is not in the set, and `listGroups` gives such a row its breadcrumb. Account preferences live on the single `user_prefs` row `me`. Every field there is an additive string read with a fallback, for example `today_events`, `upcoming_today` and `day_parts`.

## Goals / Non-Goals

**Goals:**
- One panel, one state type and one write path for project, label and built-in lists. A built-in view is one more `DisplayScope`.
- Each view's default is today's output, byte for byte, without writing anything.
- No new concept on screen. Every control in the panel already exists somewhere, except the Nest subtasks switch, which turns on the project's tree rows.

**Non-Goals:**
- Changing which tasks a view holds, its count, the briefing, display mode, or the server's idea of Today.
- Board layout, Show completed, Show on rows and extra filters (proposal: out of scope).
- Drops on the new group headings. A Project, Priority or Label heading in Today takes no drop. Upcoming's day headings keep taking theirs.
- Urgency on the built-in views. `urgency-sort` (in flight) keeps Today and Upcoming out of its scope, and this change does not add it.

Two in-flight changes touch the same requirements. `upcoming-drag` (all tasks done, not archived) modifies `manual-ordering` "Which views are manually ordered" and `upcoming-start-with-today` "Upcoming starts with Today's own groups". This change's deltas start from `upcoming-drag`'s text, so `upcoming-drag` archives first.

## Decisions

### D1. Where the preferences live: per-field `user_prefs`

Thirteen additive string fields on `user_prefs`, default `""`, declared in `internal/sync/ops.go` `Schema`:

| View | Fields |
| --- | --- |
| Today | `today_group_by`, `today_sort_by`, `today_sort_dir`, `today_row_layout`, `today_subtasks` |
| Upcoming | `upcoming_sort_by`, `upcoming_sort_dir`, `upcoming_row_layout`, `upcoming_subtasks` |
| Inbox | `inbox_group_by`, `inbox_sort_by`, `inbox_sort_dir`, `inbox_row_layout` |

The values use the panel's existing words: the `GroupBy` and `SortBy` strings, `field:<id>` for a custom field, `asc`/`desc`, `line`/`detailed`. Today's grouping adds the value `day`. `*_subtasks` is `nested`, and anything else reads as flat. An empty, unknown or out-of-place value (for example `section` on Today) reads as the view's default and is never rewritten. These are settings, not content: they are not encrypted, derive no activity, go to the user's own devices only, and leave and come back with the export (`user_prefs` is already exported and restored by the own-export import).

Convergence is per field, last writer wins. Changing a grouping on the laptop and an order on the phone keeps both, as `list-display-options` promises for projects. A 1.0 client keeps fields of a known entity that it does not know and ignores them (the established additive pattern; `today_events`, `upcoming_today` and `full_titles` arrived the same way), so it shows the defaults.

Alternatives:
- *One JSON string per view* (`today_display`): three fields instead of thirteen, but a grouping and an order changed on two devices would lose one of them. Rejected: it breaks per-field convergence, which the panel promises everywhere else.
- *`project_prefs` rows keyed `today`, `upcoming`, `inbox`*: reuses `group_by`, `sort_by`, `sort_dir` and `row_layout` with no schema change. But those rows mean "a project", and trash purge (`internal/sync/trash.go`), the importer's id mapping and the export would all carry fake project ids. Rejected as a hidden special case.
- *A new `view_prefs` entity*: clean, but it needs a scope rule, an export key, an importer kind and REST handling, and 1.0 clients would get ops for an entity type they do not know. Rejected as more surface for the same result.
- *Device storage*: no sync. The issue asks for it to follow the account. Rejected.

### D2. What each view offers and refuses

| | Today | Upcoming | Inbox |
| --- | --- | --- | --- |
| Rows | One line, Detailed (account's by default) | same | same |
| Group by | **Time of day**, Project, Priority, Label, None | not offered | **None**, Due date, Priority, Label |
| Order by | **Due date**, Priority, Created, Deadline, Title, custom fields | **Due date**, Priority, Created, Deadline, Title, custom fields | **Manual order**, Priority, Due date, Created, Deadline, Title |
| Direction | Ascending by default | Ascending by default | Ascending by default |
| Nest subtasks | Off by default | Off by default | not offered (always a tree) |

Bold is the default. Why each refusal:
- **Upcoming has no Group by.** Its days are the view. A second grouping inside each day would be a new nested-groups concept.
- **Today and Upcoming have no Manual order.** `manual-ordering` keeps them sorted by their own rules, with position only breaking ties. Today's order is per logical day and spans projects. A manual order there is #777's "a Today list you fill by hand", which needs its own design.
- **Today has no Due date grouping.** Everything is due today or earlier, and Earlier is already that split.
- **The Inbox has no Project grouping or custom fields.** Inbox tasks have no project, so both would be empty.
- **Today's Time of day** is today's behaviour named: Today and This Evening, plus Morning and Afternoon while day parts are on. Day parts stay their own preference.
- **Due date ascending** on Today and Upcoming is `compareDueThenPriority`: due, then priority, then position. `compareTasks('due','asc')` gives the same order, so the default and the explicit choice agree.

The panel needs two small changes. It leaves out Group by when a view offers no grouping (`groupOptions` empty). It shows the Nest subtasks switch when the value carries `subtasks`, the way it shows Notes on cards when the value carries `cardNotes`. `ListDisplay` gains an optional `subtasks`, and `DisplayScope.kind` gains `today | upcoming | inbox`. `defaultListDisplay`, `listDisplayOf`, `isDefaultDisplay` and `setListDisplay` take the new kinds from a per-kind table (choices, default, field prefix). There is no second code path.

### D3. How grouping fits Today's fixed groups

Today's groups do two jobs. Earlier, Blocked, Waiting for a slot and Done today say something about a task's *state*: late, cannot start, no slot, finished. Today, Morning, Afternoon and This Evening only lay out the day. The chosen grouping replaces only the second kind:

```
Earlier                 ← unchanged, first, with Move all to today / Reschedule…
<the chosen groups>     ← Time of day (default) | Project | Priority | Label | None
Blocked                 ← unchanged, folded
Waiting for a slot      ← unchanged, folded, fill order
Done today              ← unchanged, folded, newest first
```

The chosen order applies inside Earlier, inside each chosen group and inside Blocked. Waiting for a slot keeps its fill order, because that order tells you what comes in next. Done today stays newest first. Groups use the headings and order of a saved view's grouping (`groupTasks(..., once = true)`). A task is listed once, under its first label in label order. The Project heading is named content (`named`), and its rows leave the project out, as a saved view grouped by project does. Rows of today's tasks still imply today's date, so a task due today shows its time alone. Under any grouping other than Time of day, Morning and Afternoon rows show their part chip, because no heading states it any more.

The Today limit is untouched. `useClosedList` fills slots from the whole of Today before grouping or ordering, so the same tasks hold the slots whatever the display. The lead line ("3 of 5") is unchanged.

Alternatives:
- *The chosen grouping replaces every group, Earlier included.* Late tasks would sit among on-time ones, and Earlier's two header actions would have no home (`web-app` "Standard views"). Rejected (see open question 1).
- *Grouping inside each day group* (Project within Morning). It gives two levels of headings, which is a new concept. Rejected.

### D4. Upcoming: order within the day, Start with Today follows Today

Upcoming keeps `groupUpcoming`. The chosen order sorts each day's tasks. Drops on a day keep moving a task to that day (`upcoming-drag`). When Start with Today is on, the Today groups at the top are built by `todayGroups` with **Today's** display options, so they keep matching Today (`upcoming-start-with-today`: "the Today groups SHALL hold the same tasks as Today"). Upcoming's own options apply from Tomorrow on.

Alternative: Upcoming's options for every row, the Today part included. Then the top of Upcoming would differ from Today, the opposite of what the option exists for. Rejected (see open question 4).

### D5. Subtasks in flat views: nest within a group, no context rows

With Nest subtasks on, each group's tasks go through `buildTaskTree`. A subtask whose parent is listed **in the same group** is drawn under it, indented, with the project's collapse chevron and the per-device collapse set. Left and Right fold and unfold on the selected row. A subtask whose parent is not in that group (another group, not due, done, or another view) stays a top-level row with its breadcrumb, as now. Sub-subtasks nest to any depth by the same rule (#1108). The chosen order sorts top-level nodes. Children keep their manual order under their parent, as in a grouped project (`sortedRoots`). The slot count, the sidebar count and the briefing count tasks, not trees, so nothing changes there.

This is the project's tree, applied per group. It reuses `buildTaskTree`, `flattenTree`, `toRow` and the tree keys. It creates no row that is not in the view.

Alternatives:
- *Show a parent outside the view as a dimmed context row* (#1089 item 5). This is a new kind of row: it is not in the view, yet it has to be selectable or skipped by the cursor, it has to be completable or not, it must stay out of counts, out of the slots and out of bulk selection, and it needs its own accessible name. Deferred (see open question 2).
- *Always nest.* That changes today's default, which this change keeps exactly. Rejected.
- *Move a subtask into its parent's group* (as projects do with grouping). In Today that would put a late subtask under a parent's "Today" heading and hide that it is late. Rejected.

### D6. Inbox: the project path

The Inbox already builds a tree. Group by Due date, Priority or Label takes the existing project branch of `listGroups` (`p.view === 'project'` widens to the Inbox): top-level tasks grouped and sorted, subtasks under them in manual order. The Inbox has no sections and no Later group. A drag or an Alt+arrow move while another order is shown first sets Manual order ascending and keeps the grouping, through the same `onReorder` as a project. The detail pane, the source lines, Process and its count do not change. Triage keeps its queue in manual order (`inbox-triage` "Queue and progress"), so the queue does not depend on a display choice.

### D7. Reset

The panel gets a **Reset** button below More options, shown only while `isDefaultDisplay` is false for that view, and offered only on the built-in views (D2 table). It writes `""` to every field of that view that is not already empty, as one `mutate` call (one op per field), locally first. Focus moves to the panel's first control, because the button disappears, and the panel stays open. Undo is not added: Reset is visible, cheap to redo, and changes no task.

Alternative: Reset on project and label pages too. That is cheap with the same code, but it changes `list-display-options`. It is left out to keep this change to the three views and is listed as a follow-up.

### D8. Keys, screen readers and the phone

- `r g`, `r o` and `r r` register on the three views with that view's choices only (`useDisplayKeys` already filters by `groupOptions` and `sortOptions`). `r g t` is new: "Time of day", Today only, with no conflict in the registry (`t` is free after `r g`). `r g …` does nothing on Upcoming, and `r o m` does nothing on Today and Upcoming. The notice wording is the panel's.
- The panel is the existing one: a popover from 640 px and a bottom sheet below, labelled "Display options", with selects, a segmented radio group for Rows, a `Switch` for Nest subtasks and a plain button for Reset. All are keyboard-operable and at least 44 px on a coarse pointer. No new pattern.
- Nested rows reuse the tree's `aria-level`, `aria-setsize`, `aria-posinset` and `aria-expanded` (`siblingPositions`), so a screen reader hears the depth as in a project.
- Phone: the display button goes in the bar's `extraSlot`, as on project and label pages. Display mode, Select tasks and the duration filter keep their places.

### D9. Agents, MCP, REST, CLI and the server

Unchanged. `today_summary`, `list_tasks`, `ot today`, `ot inbox`, REST and CalDAV report which tasks are in a view, and the web app's layout is not part of that. The server learns thirteen schema fields and nothing reads them. A future agent that wants to "show Today by project" would write `user_prefs` like any other preference, and nothing is added for that here.

### Interface budget

- Rows of chrome: unchanged. The display button is one more icon among the header's actions (desktop) or in the bar's existing slot (phone). Nothing is added between the header and the quick add.
- Task properties: unchanged. No property is added to a row. Nested rows show the same properties as flat ones.
- Sidebar destinations and scroll regions: unchanged. The panel is a popover or sheet, not a scroll region of the screen.
- Shortcuts: one new sequence, `r g t`, registered in `web/src/lib/shortcuts.ts`. The registry's conflict test covers it.

### Size and memory

No dependency. The server binary changes by thirteen schema entries. The web code is per-kind tables, one switch, one button and a widened branch in `listGroups`. All of it is in modules already on the first load (`DisplayPanel`, `listDisplay`, `listGroups`), so it is estimated under 1 KB gzip against `initialGzipKB` 693. Runtime memory: grouping and nesting are linear passes over the rows the view already holds.

## Risks / Trade-offs

- [The incremental list path (`patchViewTasks`, `keepGroups`) assumes Today's fixed grouping] → Grouping changes only `listGroups`, which already rebuilds groups from the patched task list each time. `keepGroups` keeps unchanged row objects whatever the grouping. Tests cover a write under Group by Project with the 10,000-task seed's Today timing (`performance-budgets`).
- [Thirteen fields make `user_prefs` wider] → Each is a short string, absent until written. The alternative that keeps it narrow (D1, one JSON per view) loses convergence.
- [Grouping Today by project can look like a saved view, which may confuse "which one do I use"] → The panel changes layout only. A saved view is still the way to get a different set of tasks. The docs say this in one line.
- [Someone sets Today to Group by None and loses This Evening] → Reset is one tap, and the panel shows the current choice.

## Migration Plan

None. The fields are absent until written, and absent reads as today's behaviour. Rolling back the web app leaves the fields stored and ignored.

## Owner decisions (2026-11-09)

The owner took the recommendation on each open question below: Earlier stays first; no context rows for parents outside the view (breadcrumb instead); no Show on rows in this change; Upcoming's Today part follows Today's display options.

### The questions as asked

1. **Does Earlier stay its own group when Today is grouped another way?** Recommendation: yes. Earlier stays first with Move all to today and Reschedule…, and the chosen grouping lays out only today's own tasks. Folding late tasks into, say, their project group hides that they are late and leaves Earlier's actions without a home.
2. **Should parents outside the view be shown dimmed for context (#1089 item 5)?** Recommendation: not in this change. Nest only when the parent is in the same group, and keep the breadcrumb otherwise. A context row is a new kind of row (cursor, completion, counts, slots, bulk selection, screen reader). Ship nesting first, and design context rows separately if people still ask once they have nesting.
3. **Should built-in views also get Show on rows (hide row properties), as saved views have?** Recommendation: not now. The panel stays the same on projects, labels and built-in views (Rows, Group by, Order by), and Show on rows would add three more fields and a part no project page has. If wanted, add it to projects, labels and built-in views together in one follow-up.
4. **With Start with Today on, do Upcoming's Today groups follow Today's display options or Upcoming's?** Recommendation: Today's. That option promises that Upcoming's top matches Today. Upcoming's own order and nesting apply from Tomorrow on.
