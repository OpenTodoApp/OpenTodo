---
title: Saved views
summary: Turn a filter query into a view in the sidebar, pin it to Favourites, group and sort it, manage it from its menu, and put up to six views on one board whose columns re-plan the cards dropped on them.
audience: user
section: Guides
specs: [custom-views]
screens: [filters#save-your-own-views, saved-filter#save-your-own-views, dashboard#build-a-dashboard]
order: 23
---
# Saved views

<picture><source srcset="images/filter-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/filter-light.webp" alt="The Filter view with the query (@call | @errand) & due <= 7 days and the matching tasks below."></picture>

When the built-in views aren't enough, describe the tasks you want with a filter query and save the result as a view of your own. Saved views sync to all your devices, and a dashboard shows several of them at once.

## Save your own views

Describe what you want in the **Filter** view, then save it. For example, `blocked` lists every task waiting for another one (save it as **Waiting for**), `@waiting & open` lists everything you labelled as waiting, and `due <= 7 days & p1` shows urgent tasks for the coming week. The filter language is explained in [Labels and filters](labels-and-filters.md), and [Filter queries](filters.md) has ten ready-made examples to copy.

To save the current filter, press <kbd>s</kbd> in the results (or use the save button), and give it a name. It is listed in the **Filters** group of the sidebar, pinned to **Favourites** at the top of the sidebar, and synced to all your devices. The **Filters** group lists every saved filter, pinned or not; it starts folded on a new device. A filter's live count is on the Filters overview (<kbd>g</kbd> <kbd>v</kbd>) and in its page header, not in the sidebar.

Each saved view can group its tasks (by project, date, priority or label) and sort them (by date, priority, your own order, creation time or title). Change these from the top of the view. To change the query itself, press <kbd>/</kbd>, edit it and press <kbd>Enter</kbd>.

The **All** link next to **Filters** (or <kbd>g</kbd> <kbd>v</kbd>) opens the list of all your saved filters and boards. From there you can rename, reorder, pin, unpin or delete them.

Every saved view has the same menu, wherever you open it: the **⋯** button on its row in the sidebar or the views list, its header, or a dashboard. With a row focused, <kbd>.</kbd> (or <kbd>Shift</kbd>+<kbd>F10</kbd>) opens it too.

- **Rename**.
- **Pin to sidebar** and **Start view on this device**: a check mark shows which apply. **Pin to sidebar** (called **Pinned to sidebar** before) adds the view to **Favourites** or takes it out; it stays in the **Filters** group either way.
- **Move up** and **Move down**: unavailable at the top or bottom of the list, with the reason shown. Opened from **Favourites**, they move the view among your favourites.
- **Delete view…** asks for confirmation first. Deleting a view never touches your tasks.

<picture><source srcset="images/view-menu-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/view-menu-light.webp" alt="The menu of a saved view: Rename, the Pin to sidebar and Start view on this device check items, Move up and Move down, and Delete view at the bottom."></picture>

## Build a dashboard

A dashboard (a board) puts up to six saved views side by side, each with its count and first ten tasks: "Due this week" and "Waiting on others" for a morning review.

<picture><source srcset="images/dashboard-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/dashboard-light.webp" alt="The Weekly review dashboard with three panels: Due this week, Deep work and Waiting on others."></picture>

Open the views list (<kbd>g</kbd> <kbd>v</kbd>), choose **New board**, then **Empty board**, name it, then add saved views as panels from the dashboard's header. Panels stack on a phone. Move between panels with <kbd>Tab</kbd>, and through a panel's tasks with <kbd>j</kbd> / <kbd>k</kbd>.

### Sort work by dropping cards

In **Arrange**, choose **Rule** next to a panel to set what a dropped card gets: labels added or removed, a priority, a date (today, tomorrow, next week or none), Someday, a section, completed or reopened. A bolt marks a column with a rule; others take no drops.

Drag a card onto a column, or press <kbd>Shift</kbd>+<kbd>→</kbd> / <kbd>Shift</kbd>+<kbd>←</kbd> to move the selected card to the next column with a rule. A message names the changes, with Undo. A card that still doesn't match the column's filter stays there, marked **Not matching**, until you leave the board.

**New board** also offers the **Eisenhower matrix**: four filters by priority and date, **Urgent and important** to **Neither**, each with a rule.

<picture><source srcset="images/eisenhower-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/eisenhower-light.webp" alt="The Eisenhower board with four quadrants: Urgent and important, Important, not urgent, Urgent, not important, and Neither."></picture>

Each device can open on a saved view or a dashboard: see [Choose where the app opens](views.md#choose-where-the-app-opens).
