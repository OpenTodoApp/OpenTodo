---
title: Labels and filters
summary: Tag tasks across projects with labels, then find exactly what you need with the filter language and save it as a view.
audience: user
section: Guides
specs: [labels, filter-queries, action-menus]
screens: [filter#find-tasks-with-a-filter, label#see-everything-with-one-label]
order: 40
card: filter
---
# Labels and filters

<picture><source srcset="images/labels-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/labels-light.webp" alt="The errand label view listing its tasks grouped by project."></picture>

Projects say where a task belongs. Labels say what kind of task it is, across all projects: `@call`, `@errand`, `@waiting`, `@deep-work`. Filters then let you ask questions like "every call I need to make this week".

## Add a label to a task

Pick whichever is quickest:

- Type it in quick add: `Phone the bank @call`.
- Select a task and press <kbd>L</kbd>, start typing, and press <kbd>Enter</kbd>. The picker stays open so you can add more.
- Open the task and use **Labels** in the panel.

If the label doesn't exist yet, typing its name and pressing <kbd>Enter</kbd> creates it. On a task row, labels show as small chips with the label's colour and name, two at most, then "+2" for the others (hover or focus them to read every name). To remove one, open the task and select the **×** on the chip.

Labels are personal. In a shared project, other members don't see the labels you add.

## See everything with one label

Once you have a label, the **Labels** group in the sidebar lists your labels; it starts folded on a new device. The number of open tasks for each is on the labels page (<kbd>g</kbd> <kbd>l</kbd>) and in the label's header, not in the sidebar. Select one to see all its tasks, grouped by project; a task you add there with [quick add](quick-add.md) gets the label. **Pin to sidebar** in a label's menu (in the sidebar, on the labels page or in the label's header) adds it to **Favourites** at the top of the sidebar.

**All** next to Labels (or <kbd>g</kbd> <kbd>l</kbd>) opens the labels page, where you rename, recolour, reorder, merge and delete labels: see [Manage labels](manage-labels.md).

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
| `blocked`, `unblocked` | waiting for an open task, or not | `unblocked & today` |
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

When a query is useful, keep it: press <kbd>s</kbd> in the results, give it a name, and it appears under **Filters** in the sidebar, and in **Favourites** until you unpin it. Its live count is in the Filters overview (<kbd>g</kbd> <kbd>v</kbd>) and its page header. Saved views sync to your other devices. See [Views](views.md#save-your-own-views) for grouping, sorting and dashboards.

## Tips

- Labels for context work well: `@call`, `@computer`, `@errand`, `@home`. Then a view like `@errand & due <= 2 days` is your shopping list.
- A `@waiting` label plus a pinned "Waiting on others" view makes follow-ups hard to forget.
- Filters run on your device. They're instant, and they work offline.
- Labels and saved filters belong to one [workspace](workspaces.md), so the same name can exist in two of them.
