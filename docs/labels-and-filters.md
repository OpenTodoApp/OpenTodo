---
title: Labels and filters
summary: Tag tasks across projects with labels, then find exactly what you need with the filter language and save it as a view.
audience: user
section: Guides
specs: [labels, filter-queries, action-menus]
screens: [filter#find-tasks-with-a-filter]
order: 40
card: filter
---
# Labels and filters

Projects say where a task belongs. Labels say what kind of task it is, across all projects: `@call`, `@errand`, `@waiting`, `@deep-work`. Filters then let you ask questions like "every call I need to make this week".

## Add a label to a task

Pick whichever is quickest:

- Type it in quick add: `Phone the bank @call`.
- Select a task and press <kbd>L</kbd>, start typing, and press <kbd>Enter</kbd>. The picker stays open so you can add more.
- Open the task and use **Labels** in the panel.

If the label doesn't exist yet, typing its name and pressing <kbd>Enter</kbd> creates it. Labels show as small colored chips on the task. To remove one, open the task and select the **×** on the chip.

## See everything with one label

The **Labels** group in the sidebar lists your labels with the number of open tasks for each. Select one to see all its tasks, grouped by project.

<picture><source srcset="images/labels-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/labels-light.webp" alt="The errand label view listing its tasks grouped by project."></picture>

**All** next to Labels (or <kbd>g</kbd> <kbd>l</kbd>) opens the labels page: every label with its colour, its number of open tasks, a drag handle and a **⋯** menu. The sidebar rows have the same menu.

### Rename, recolour and reorder

- **Rename**: double-click a label, or focus it and press <kbd>F2</kbd>. A name another label already has is refused, and the old name stays.
- **Edit…** in the menu opens a panel with the name, the colour swatches (arrow keys move between them), and buttons to move the label.
- **Reorder**: drag a label by its handle (on a phone, press and hold the handle so scrolling the list still works), or focus it and press <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd>. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> moves it to the top or bottom. The new position is announced to screen readers.
- <kbd>.</kbd> or <kbd>Shift</kbd>+<kbd>F10</kbd> opens the menu of the focused label.

<picture><source srcset="images/label-menu-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/label-menu-light.webp" alt="The Labels page with the menu of the errand label open: Edit, Rename, Move up and Move down with their shortcuts, Merge into, and Delete label at the bottom."></picture>

### Merge and delete

- **Merge into…**: type to find the label to keep. A confirmation names both labels and how many tasks change. Tasks with the first label get the second one instead, and the first is deleted. Handy when you end up with both "Errand" and "errand".
- **Delete label…**: the confirmation says how many tasks carry it. It's removed from them; the tasks stay.

If two of your devices created the same label while offline, both copies get a **duplicate** badge, and the labels page offers to merge them. **Swap** chooses which one is kept.

Every change is saved on this device first and syncs to your other devices, also when you make it offline.

Labels are personal. In a shared project, other members don't see the labels you add.

## Find tasks with a filter

Open **Filter** in the sidebar (or press <kbd>g</kbd> <kbd>f</kbd>) and type a query. Results appear as you type, grouped by project.

<picture><source srcset="images/filter-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/filter-light.webp" alt="The Filter view with the query (@call | @errand) & due <= 7 days and the matching tasks below."></picture>

A query combines small pieces:

| Piece | Means | Example |
| --- | --- | --- |
| `@name` | has this label | `@call` |
| `#name` | in this project | `#Work` |
| `##name` | in this project or its sub-projects | `##Work` |
| `p1` … `p4` | priority | `p1` |
| `today`, `tomorrow`, `overdue`, `no date` | due then, or not at all | `overdue` |
| `due <= 7 days` | due within the next week | `due before friday` |
| `search: text` | words in the title or notes | `search: invoice` |
| `completed` | include completed tasks | `#Home & completed` |

Join them with `&` (and), `|` (or) and `!` (not), and use brackets to group:

```
(@call | @errand) & due <= 7 days
```

That reads: tasks labeled call or errand, due within the next seven days. A few more:

- `#Work & p1 & due <= tomorrow`: the most important work for today and tomorrow.
- `overdue & no project`: overdue tasks still sitting in the Inbox.
- `@waiting & !#Work`: everything you're waiting on, outside work.

Names with spaces go in quotes: `#"Client A"`. Upper and lower case don't matter. If you mistype, a message under the box says where, and the previous results stay visible.

Press <kbd>Enter</kbd> to jump from the box to the first result, and <kbd>Esc</kbd> to go back. <kbd>↑</kbd> and <kbd>↓</kbd> in the box bring back your recent queries.

The full language, with ten worked examples, is in [Filter queries](filters.md).

## Save a filter as a view

When a query is useful, keep it: press <kbd>s</kbd> in the results, give it a name, and it appears under **Views** in the sidebar with a live count. Saved views sync to your other devices. See [Views](views.md#save-your-own-views) for grouping, sorting and dashboards.

## Tips

- Labels for context work well: `@call`, `@computer`, `@errand`, `@home`. Then a view like `@errand & due <= 2 days` is your shopping list.
- A `@waiting` label plus a pinned "Waiting on others" view makes follow-ups hard to forget.
- Filters run on your device. They're instant, and they work offline.
