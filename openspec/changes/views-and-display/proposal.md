# Proposal

## Why

Part 6 of the "Precision" redesign, after `precision-tokens`, `precision-shell` and `precision-rows`. The round-2 mock-ups `view-display.png`, `view-save.png` and `filter-builder.png` turn "Filters" into views: a query is what a view matches, and the view also says how its results look. Today the two are mixed up in the interface:

- **The word.** The sidebar calls saved views "Filters", the overview "Filters" with "Saved filters", and the page that builds a query "Filter". People who come from Linear or Notion look for "Views". The data, the API and the routes already say "view".
- **The header.** A saved view puts its query input, a Builder button and three selects (group, sort, direction) above the list: four rows of chrome before the first task.
- **No display choices.** A view cannot be a board, cannot list completed tasks without changing its query, and cannot choose what its rows show. The property column of `precision-rows` shows the same five properties everywhere.
- **Saving interrupts.** "Save filter" opens a dialog over the results, and the saved view forgets the grouping chosen while building it.

## What Changes

- **Views in the interface:** the sidebar group, the overview and the palette say "Views"; the query page is "New view"; a view's header reads "Views › <name>". The addresses become `/views`, `/views/new` and `/views/<id>`; `/filter` and `/view/<id>` keep working and are replaced in place. The query language keeps the word "filter", and so does the toolbar's Filter button.
- **The toolbar:** under the header, the query's conditions as chips in words ("Label is waiting"), then "Filter"; on the right, the filter button and the display button. One row instead of four.
- **The filter panel:** the #279 builder restyled, in a panel that opens in place under the toolbar with its count in the header and the query input as its formula line ("Edit as text"). Closed by default on a saved view, open on New view, kept per device.
- **The display panel:** layout (List or Board), Group by, Order by, Completed tasks (Hide or Show), "Show on rows" (date, project, labels, estimate, assignee, deadline, start, origin) and the sort direction folded under "More options". On a saved view every choice is written to the view at once.
- **Save as view in place:** the New view page's header becomes a card with the name, Cancel and Save view; the view is saved with its grouping, order and display options.
- **Three additive view fields:** `layout`, `show_completed` and `hidden_props`, in sync, the REST API and the export. A view without them looks as before.

Out of scope:
- **Projects, Today and Upcoming** keep their own display menus. Moving them onto the same display panel belongs with `precision-boards-timeline` (projects) and the day pages' own changes.
- **Sub-tasks, empty groups and nesting** under "More options" (the mock-up's hint) are new behaviour and are not part of this change.
- **Location on rows:** the row has no location cell, so the mock-up's "Location" toggle is left out.
- **"Save to" another workspace** and a view description: views are saved in the current workspace, without a description field.
- **Drag and drop on a view's board:** the cards are not movable; a board of views with on-drop rules (`rule-boards`) remains the way to move work by dropping.
- **The display mode** (`display-mode`) of a saved view keeps its own options.

ROADMAP: extends the "Saved views pinned to the sidebar" row (`custom-views`) with display options; row 6 of the Precision build plan.

No new environment variable; the op log format is unchanged (three additive fields on `view`).

## Capabilities

### Modified Capabilities

- `custom-views`:
  - "Saved view entity": the display options;
  - "Save and edit a view from the Filter view": Save as view in place, the filter panel;
  - "Pinned views in the sidebar": the Views group;
  - "Saved filters and boards in the user interface": views, the addresses;
  - "Grouping and sort options": in the display panel, the same on New view;
  - "Views API and export": the display fields.
  - Added: "Display panel", "Toolbar filter chips".
- `filter-queries`: "Filter view" becomes the New view page with the toolbar and the filter panel.
- `app-shell`: "Sidebar structure" names the Views group and New view.
- `command-palette`: "Filter queries inline" opens a new view; "Palette sections and recents" heads the section "Views".

## Impact

- Web: `web/src/app/views/` (toolbar, chips, filter panel, display panel, results, save card, crumb), `FilterView.tsx`, `SavedViewView.tsx`, `ViewsView.tsx`, `TaskRow.tsx` (hidden properties), `router.ts`, the sidebar, palette and shortcut wording, `lib/views.ts` (display options, completed matches), `lib/types.ts`, `lib/ops.ts`; the five catalogs; one interface icon (`sliders-horizontal`).
- Server: `internal/sync/ops.go` (three schema fields), `internal/httpapi/views.go` (validation).
- Docs: `docs/api.md`, the views and filter guides, `docs/interface-guide.md`, CHANGELOG.
