# Design

## Context

The sidebar (`web/src/app/Sidebar.tsx`) already computes every number this change needs:
- the open-task count per project (`openCountsByProject` in `web/src/lib/projects.ts`, where a collapsed parent carries its subtree total);
- per label (`useLabelData`);
- per saved view (`useViewCounts` over `evaluateViews`).

It shows them only in accessible names, on hover for projects, and on a coarse pointer for projects (`projectCountMode`). This is the quiet-sidebar rule of `app-shell` "Sidebar structure". Promoted destinations are the synced `user_prefs.sidebar_destinations`; their order is fixed by `primaryDestinations`. Views carry `color` but no icon; projects and sections take a catalogue icon validated by `iconset.Valid` on REST and MCP (`internal/httpapi/sections.go`, `internal/agenttools/write_structure.go`), while sync accepts any string. The New view page (`web/src/app/FilterView.tsx`) keeps a query history in the local meta table and loses the current query when it unmounts.

## Goals / Non-Goals

**Goals:** four small, independent improvements, each behind the existing places (Settings → Appearance, the view menu), with the default sidebar unchanged.

**Non-Goals:**
- a new count definition (the counts keep today's meaning);
- per-device sidebar layouts beyond what exists;
- any server logic beyond the view icon check.

## Decisions

### D1: Counts are opt-in, one synced choice

`user_prefs.sidebar_counts` is `''` (Inbox and Today, the default) or `all`. Unknown values read as the default and are kept unchanged. It is synced because the sidebar's other choices (destinations, favourites) are, and someone who wants numbers wants them on every device.

With `all`:
- project, label and saved-view rows, and their favourites, show their count at rest;
- a list with nothing open shows no number, never "0";
- dashboards show none, as now;
- collapsed group headers keep their item count, as now.

The meaning of each count is unchanged:
- **project:** open tasks that are not deferred or Someday (`openCount`), including subtasks. A collapsed parent shows its whole subtree's total, and an expanded one shows its own, as the hover count does today;
- **label:** open tasks carrying the label;
- **view:** open matches of the view's query in its workspace.

Sequential projects (`project-flow-modes`) still count every open task, not only the available one. That change may revisit this.

*Alternatives:*
- counts on by default, as #545 asks. Rejected: it reverses the quiet-sidebar decision for everyone;
- per device (a phone owner may want fewer numbers). Rejected: the coarse pointer already shows project counts.

### D2: The ⋯ button takes the count's place on hover

On a fine pointer, the existing `hover-reveal` ⋯ button of a project row sits where the count is. While the row is hovered or focused, the count is hidden and the button is shown in the same slot, so the row never grows (#545 point 3). Label and view rows get their menu button the same way; their menus already exist and open from the right-click and the overview.

On a coarse pointer the count stays, and the menu is the row's long press, as today. The count stays in the accessible name in every case.

### D3: Destination order is a separate synced field

`user_prefs.sidebar_order` is a comma-separated list of destination ids (`inbox,today,upcoming,calendar` plus any promotable id). When the primary destinations are drawn in Lists only and Companion:
1. the ids listed in the order come first, in the stored order, keeping only those that are currently primary;
2. then the remaining primary destinations, in the default order (the fixed four, then promotions in promotion order).

An unknown id is ignored and kept. A promoted destination that is not in the order lands at the end.

`sidebar_destinations` keeps its meaning: which ones are promoted. Writing positions into that list would make an older client treat `inbox` as a promotion it does not know, mixing two meanings into one field.

Settings → Appearance turns the promotion switches into one "Sidebar destinations" list:
- every primary candidate is listed in order, with a drag handle and Move up and Move down in its row menu;
- the promotion switch for the promotable ones;
- the fixed four have no switch.

Keyboard: Alt+↑ and Alt+↓ move the focused row, as reordering already does elsewhere (`manual-ordering`).

In Open Loops first the list is disabled with the existing explanation, because the method fixes the six places. The phone drawer leaves out the tab bar's views (`phone-v2` D7), and the remaining primary destinations follow the order there too.

*Alternatives:*
- a device-only order. Rejected: the issue says "synced";
- reordering by dragging in the sidebar itself. Rejected: it competes with dropping tasks onto Inbox and Today, which the sidebar already accepts.

### D4: View icon as on projects

Views gain `icon` (nullable string, default null), which is not content.
- **Null:** the view keeps today's default icon (filter for a list view, board for a board, dashboard for a dashboard).
- **Setting it:** "Icon…" in the view menu (`custom-views` "View menu actions") uses the `iconPickerSpec` step picker that projects use, including "No icon". In the palette it runs as a Combobox.
- **Where the icon shows:** the Views group, Favourites, the Views overview, the view's page header, the palette's view results and the Start view choice.
- **Validation:** sync accepts any string, as for sections, so a newer catalogue stays additive; an unknown name renders the default icon. REST create and patch accept `icon` as null or a name for which `iconset.Valid` is true, else 400 `invalid_input` naming `icon`.
- **MCP and CLI:** no saved-view write tool exists in either. `agent-tools-complete` (0.20) will reuse the same check.
- **Export:** carries the field.

*Alternative:* the view's colour as a dot, like a project without an icon. Rejected: views' colours are not shown today, and choosing one adds a second picker for little scanning value.

### D5: The draft lives in the local meta table

The New view page saves `{query, group_by, sort_by, sort_dir, layout, show_completed, hidden_props, row_layout}` to the local meta table under `filterDraft:<workspace id>`:
- debounced by 300 ms;
- next to the query history, never synced or exported;
- cleared on sign-out with the other local data.

The page restores the draft when it opens.
- **`?q=` in the address:** replaces the query (the previous draft query goes into the history, so Up brings it back).
- **Save as view:** clears the draft.
- **"Clear":** in the filter panel's header; empties the query, resets the display options to the defaults and clears the draft. Undo puts it back while its toast is shown.
- **Empty draft:** nothing is stored, and the page reads as today.

The builder's open or closed state is already kept per device.

Encrypted accounts: the query is content. It stays only on the device, like the history, which is the existing trust boundary.

*Alternatives:*
- a synced draft view row. Rejected: it would create a hidden view entity and conflicts between devices;
- `sessionStorage`. Rejected: lost on a reload and per tab, which #559 asks to avoid.

### D6: Interface budget

- **Primary destinations:** no new one. The six-destination cap in Open Loops first is unchanged, and the order only moves existing rows.
- **Chrome:** no row above lists.
- **Task properties:** none added.
- **Scroll regions:** unchanged.
- **Shortcuts:** no new shortcut; Alt+↑/↓ in the settings list reuses the reorder keys.
- **Counts:** they add no rows; numbers sit in the rows' existing trailing slot.

## Data model, size and budget

- **`user_prefs`:** `sidebar_counts` (string, default `""`) and `sidebar_order` (string, default `""`).
- **`view`:** `icon` (nullable string, default `null`).

All are additive and converge per field by last-writer-wins. No dependency, so no change to the image size or runtime memory. Counts reuse the sidebar's existing live queries, so there is no extra pass over tasks.

## Risks / Trade-offs

- [With every count shown, the sidebar is busier] → Opt-in only. The default stays the quiet sidebar.
- [View counts evaluate every query on each change] → Already done for accessible names today, so there is no new cost.
- [Two devices reorder at the same time] → Last-writer-wins on the whole order. The other device's order is lost, which is acceptable for a preference.
- [A draft from an old query refers to a deleted label] → The query shows its usual warning, and Clear starts over.

## Migration Plan

None. Empty fields read as today's behaviour. To roll back, ship a client without the controls; older clients ignore the fields and keep them.
