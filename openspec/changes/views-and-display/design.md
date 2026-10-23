# Design

## Context

The round-2 mock-ups (`design-references/round2/`: `view-display.png`, `view-save.png`, `filter-builder.png`; `system.md` "Toolbar") and the user's reading of Linear's views ("stable, solid, a little bit chaotic, but a good way to filter content") define the screens. `precision-shell` gives a page its compact header; `precision-rows` gives rows the property column this change lets a view trim. The filter builder of `filter-builder` (#279) and the view runner of `custom-views` stay the engine: this change rearranges them and adds three display fields.

## Decisions

### D1. Words and addresses

- **What changes:** the interface says "Views" for saved views (sidebar group, overview, palette section, `g v`), "Saved views" and "Boards" for the overview's sections, and "New view" for the query page (`g f`, the More group, the start view option). A view's header is a breadcrumb, "Views › <name>", so the way back to the overview is where the title is.
- **What stays:** the query language and its condition editor are still "filter" (the toolbar's Filter button, "No task matches this filter"), and the data, ops, API and export keep `view`.
- **Addresses:** `/views`, `/views/new` (with `?q=`) and `/views/<id>`. The router still parses `/filter` and `/view/<id>`, and the shell's existing canonical-path step replaces them in place (as it does for `/activity` and `/calendar`), so bookmarks and the palette's old links keep working without a history entry.
- **Why rename now:** the toolbar puts the conditions, the filter panel and the display options on one screen. Calling the whole thing a "filter" would name it after one of its parts.

### D2. Display options on the view

- **Three fields on `view`:** `layout` (`list` | `board`, a string like the other enumerations), `show_completed` (bool) and `hidden_props` (a string list). They are additive schema entries in `internal/sync/ops.go`, optional on the client's `View` type, and absent from older rows.
- **Read-time fallback:** `displayOptions(view)` in `lib/views.ts`, like `viewOptions`, maps an unknown layout to `list` and drops unknown property names, never rewriting the row. A newer client's value survives an older client's edit of another field, because ops are per field.
- **Why on the view, not per device:** grouping and sort are already synced fields of the view, and a view is shared across a person's devices. A board on the laptop and a list on the phone is still possible by saving two views.
- **Writes:** one `updateView` per change, which writes only the changed fields; a list compares by its items, so toggling a property twice back to the same set writes nothing.
- **REST:** `layout` joins the enumerations checked on create and patch; `hidden_props` must hold known names. Neither gets a default on create, so the API output of an existing script does not change.
- **Board layout:** the view's groups become columns of cards (`TaskCard`), in the group order, with the same keys as the list (`group:task`), so the cursor, selection and bulk keys work unchanged. Cards are not draggable: dropping on a view would need a rule for what a drop means, which boards of views (`rule-boards`) already provide.

### D3. Hidden row properties

- **The property names** (`ROW_PROPERTIES`): date, project, labels, estimate, assignee, deadline, start, origin, the things a row or card can show beside its title. Location is not among them: the row has no location cell.
- **`TaskRow` takes `hidden`**: each hidden property is left out of the values the row builds (the date also removes the time column; the project also removes its column track), so the property column of `precision-rows` keeps no empty room. The task page still shows everything.
- **Why a list of hidden, not shown:** the default is "everything", and a property added later is shown in existing views without a migration.

### D4. Completed tasks

- **"Show"** compiles the stored query as `(query) & (open | completed)`. The evaluator's rule (open matches only unless the query names a state) then lets completed matches through; a query that already names a state is left alone, so `completed = last week` keeps meaning what it says.
- **Counts:** the sidebar, the overview and the dashboards keep counting open matches (`evaluateViews` ignores the option); the view's header counts what it lists.

### D5. Toolbar and filter panel

- **One toolbar row** replaces the input, the Builder button and the three selects (four rows of chrome) under the header.
- **Chips:** `queryChips` reads the builder tree of the query (`toBuilder`). An "All of these" root gives one chip per item; any other root (an "Any of these" query, a negated group) gives one chip for the whole query; a query the builder cannot show gives "Custom query". Chips are buttons that open the panel; they never edit, so the formula stays the single stored form (filter-builder D1).
- **The panel opens in place**, under the toolbar, not as a popover: its count follows the edit while the list still shows the stored query, and both stay visible. It keeps the builder, then the query input as its formula line with "Edit as text". The per-device open state is the builder's (`builderToggle`), so a device that had the builder open opens the panel.
- **"Filter"** opens the panel and starts a new condition in the top group (it clicks the builder's own "Condition" action).
- **`/`** (`view.edit-query`) and `Esc` from the New view results open the panel when it is closed and focus the input; the empty view's action does the same.
- **The builder restyle:** quieter chips (raised surface, soft line, metadata size), ghost "Condition" and "Group" actions, the combinator select on the raised surface, groups as outlined blocks. The behaviour and the keyboard rules of `filter-builder` are unchanged.

### D6. Save as view in place

- **The header becomes a card**, not a dialog: the conditions and the results are what the name describes, so they stay visible. The card has the name field (focus on open), a line saying what is saved and where it goes, Cancel and Save view; Enter saves, Esc cancels. Errors from `createView` show under the name.
- **What is saved:** the query, the grouping, the order and the three display options chosen on the page. The New view page groups and orders with the saved view's functions (`groupTasks`, `compareTasks`), not its earlier fixed project grouping, so the saved view looks exactly like the page did.

## Interface budget

- **Chrome above the first task:** the compact header and the toolbar, two rows. The filter panel is an opened overlay-like region chosen by the user (closed by default on a saved view); the display panel is a popover.
- **Task properties visible by default:** unchanged (the row of `precision-rows`); views can only show fewer.
- **Sidebar primary destinations:** unchanged; "New view" replaces "Filter" in the More group.
- **Scroll regions:** the page and, on the board layout, the row of columns and each column's list, as on project boards (three).
- **Shortcuts:** no new key. `g f`, `g v`, `s` and `/` keep their keys with new descriptions; the registry check passes.

## Data model

Three additive fields on `view` (`layout`, `show_completed`, `hidden_props`); no rename, no migration (entities are stored per field). Offline: every change is an op applied locally first. Convergence: per-field last-writer-wins, `hidden_props` as one value.

## Size

No dependency. About 2 KB of JavaScript gzipped for the toolbar, the two panels and the save card, and one icon (`sliders-horizontal`) in the interface set; the server binary grows by a few hundred bytes.

## Risks / Trade-offs

- **The board has no drag and drop.** A user may expect to move a card between columns. The columns are groups computed from task fields; moving between them would need the on-drop rules of boards of views, which stay the place for that.
- **"Views" now names two things:** the group of saved views and a board of views. The overview keeps the two sections apart, and boards keep their "board" wording.
- **Old links in other apps** (`/view/<id>` in notes, `/filter?q=` from the palette) keep working, but after the redirect the query of `/filter?q=` survives only when the app navigated there itself, as before.
- **Projects keep their own display menu** until a later change moves them onto the display panel.
