# Design: plan from a label or a saved view

## Decisions

- **D1 One source key.** The remembered choice stays one string per device: `inbox`, `nodate`, `overdue`, `project:<id>`, and now `label:<id>` and `view:<id>`. Existing choices keep working; an unknown or deleted target falls back to the Inbox instead of an empty list.
- **D2 The Combobox, not a longer menu.** With labels and views the list of sources can run to dozens, so the menu of checkboxes becomes the design-system Combobox in a popover, grouped (Lists, Projects, Labels, Saved views), with the current source marked. The trigger keeps its name, "Plan from", and shows the source's icon and name.
- **D3 Views use the client's view evaluation.** A saved view runs through `runView` with the same context the view page uses (`useViewData`), so the list matches what the view shows, in its order. Completed, deleted and archived-project tasks are dropped afterwards whatever the view's options, because the list is for planning open work. Dashboards are not offered (they have no single list).
- **D4 Labels like projects.** A label lists its open tasks sorted by due date then priority, the same order the project source uses. Labels of the current workspace are offered (`useLabels`), as in the label pickers.
- **D5 Same limit.** Every source lists at most 200 tasks, as before.
