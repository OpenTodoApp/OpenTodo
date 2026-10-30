# Proposal

## Why

Four small sidebar requests from the community. Each one is a reason people give for going back to Todoist:
- **#545:** people want to see how much is in each project, label and view at a glance. Today a project's number shows only on hover, and labels and views show none.
- **#562:** the primary destinations (Inbox, Today, Upcoming, Calendar and any promoted ones) have a fixed order. Projects, labels and views can already be reordered.
- **#560:** saved views all share one icon, so a long Views group or a Favourites group is hard to scan. Projects and sections already take catalogue icons.
- **#559:** a half-built query on the New view page is lost as soon as the user looks at another page to check something.

The quiet sidebar (0.13) is the default for good reasons (the research's progressive disclosure, §5), so the counts are an opt-in rather than a new default.

## What Changes

- **Counts on every row (opt-in).** A new Appearance choice, "Sidebar counts": *Inbox and Today* (default, today's quiet sidebar) or *Every list*.
  - With *Every list*, project, label and saved-view rows (and their favourites) show their open-task count at rest.
  - On a fine pointer, hovering or focusing a row puts its ⋯ menu button in the count's place.
  - A collapsed parent project shows the total of its whole subtree, as it already does on hover.
  - Counts are computed on the device from local rows and are never stored.
- **Reorder the primary destinations.** Settings → Appearance lists the primary destinations (the four fixed ones plus promoted ones) with drag handles and Move up and Move down. The order is a synced preference.
  - The phone tab bar keeps Today, Inbox and Upcoming.
  - In Open Loops first the six places keep their method order, and the stored order is kept for later.
- **Icons for saved views.** A view can take a catalogue icon:
  - It is set from "Icon…" in the view menu, the same picker as projects.
  - It is shown in the Views group, Favourites, the Views overview, the view's header and the palette.
  - It is an additive `icon` field on views. REST validates it against the icon catalogue.
- **The New view draft is kept.** The query, the display options and the panel's builder state are kept per device and workspace while the user navigates away and across a reload. A "Clear" action starts over, and saving the view clears the draft.

Out of scope:
- moving a fixed destination (Inbox, Today, Upcoming, Calendar) into More, or hiding it;
- reordering the phone tab bar;
- counts on More entries;
- an unread or overdue colour on counts;
- icons on dashboards' panels, or emoji icons;
- view tools for agents and MCP (`agent-tools-complete`, 0.20);
- several drafts, or a synced draft.

Advances ROADMAP-1.0 0.17 "Calm constraints": `sidebar-polish`.

Fixes #545
Fixes #562
Fixes #560
Fixes #559

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `app-shell`: "Sidebar structure" follows the counts preference and the destination order.
- `appearance-preferences`: new "Sidebar counts preference" and "Primary destination order".
- `labels`: "Label views and counts" shows the count on the row when every count is on.
- `custom-views`: "Pinned views in the sidebar" follows the counts preference; new "View icon".
- `filter-queries`: new "New view keeps its draft".

## Impact

- **Data model and op schema (additive, not BREAKING):**
  - `user_prefs.sidebar_counts` (string: `''` = Inbox and Today, `all`) and `user_prefs.sidebar_order` (string: comma-separated destination ids).
  - `view.icon` (nullable string, catalogue name).
  - All three go in `internal/sync/ops.go`, `web/src/lib/types.ts` and `web/src/lib/ops.ts`. They converge per field by last-writer-wins.
  - The draft is device storage only and is never synced.
- **E2EE:** none of the new fields is user-written text, so none is a content field. The draft query is content: it stays in the device's storage like the existing query history, and is cleared on sign-out.
- **API:**
  - `/api/v1/views` accepts and returns `icon` (null or a catalogue name via `iconset.Valid`, else 400 `invalid_input`).
  - `docs/api.md` and the OpenAPI document gain the field.
  - No new route, so the route matrix is unchanged.
  - The export carries `icon` on views.
- **CLI/MCP:** no saved-view tools exist today, so nothing changes. `ot` ignores the extra field.
- **CalDAV, vault:** none.
- **Bundle and binary size:** a few hundred bytes of sidebar and settings code. The icon picker and catalogue are already loaded lazily for projects. No dependency.
