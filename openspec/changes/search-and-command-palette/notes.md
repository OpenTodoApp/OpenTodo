# Implementation notes

## Smoke test (task 6.1), 2026-10-15

Built binary on port 18080 with a throwaway data directory, driven by Playwright:

- `Ctrl+K` inside the notes editor did not open the box (the editor keeps it for links).
- `Ctrl+K` from the quick-add field opened the box; `appoint` found *Call the dentist* by its notes ("Book an appointment for March"); Enter opened its panel.
- `@errand & p1` listed "Open in Filter view: @errand & p1 · 1 task" and *Buy milk*; Enter opened `/filter?q=%40errand%20%26%20p1`.
- With *Buy nails* selected, the empty box listed "Open “Buy nails”" and "Complete “Buy nails”" first; typing `complete` and Enter completed it.
- At 390 px the header button opened the box as a full-width sheet.
- No console or page errors.

The smoke run found two ranking problems, both fixed and covered by tests: "Search Help for …" ranked first (it is now always last, through a `suffix` option on the combobox), and recent picks came before the context commands in an empty box (an `emptySource` keeps its order).

`make check` and `make layout-check` (Chromium and WebKit at 360, 390 and 768 px) pass.

## Decisions taken while implementing

- Object commands are generated from the menus' own item builders (`projectMenuGroups`, now exported from `ProjectHeader`, `viewMenuGroups`, `labelMenuGroups`, `sectionMenuGroups`), so the palette runs exactly the menu's handlers. Picker and confirm items open as a step of the palette; rename opens a name prompt. The label menu's "Edit…" opens the Labels page, where the edit panel lives.
- The Filter view and saved views register their list through `useListKeys`, so task commands work there too.
- Section commands apply to the selected task's section.
- Command keywords are not shown as text; commands are found by their labels.
