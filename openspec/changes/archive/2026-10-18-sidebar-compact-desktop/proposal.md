## Why

On a desktop with a short window (a laptop, a browser that is not maximised), the sidebar's fixed parts took most of its height: the name and the primary destinations at the top, then Help, Search and the icon row in the footer, then the account. Opening More pushed the projects further down, an empty Filters group still showed a sentence, and the browser's default scrollbar ran down the middle of the column. At 1280×600 with More closed only two projects were visible.

## What Changes

- **Search beside the name.** The search and commands button moves from the footer to the app name's row (tooltip with Ctrl/⌘+K). The icon rail keeps it in its footer.
- **One footer row from 768 px.** Help joins notifications, the assistant, shortcuts, the sync dot and collapse as icon buttons with names and tooltips; the account stays its own row. Phones keep Help as a full row.
- **More as a menu on a desktop.** From 768 px with a fine pointer, More is a row after the primary destinations that opens a menu (with the review and unread markers on the row and as item descriptions). Touch keeps the inline group, which scrolls with the rest (sidebar-drawer-scroll).
- **No empty groups.** Filters appears with the first saved filter (pinned or not, so All stays reachable) and Labels with the first label; the "Save a filter to pin it here." and "No labels yet." sentences go.
- **Compact density with a mouse.** Rows are 32 px and group headings tighter with a fine pointer; touch keeps its targets.
- **Thin scrollbar and edge fades.** The scroller gets a thin scrollbar in the border colour and fades an edge only while content is hidden past it.

## Impact

`web/src/app/Sidebar.tsx` (layout, More menu, footer), `web/src/ui/patterns/Sidebar.tsx` (density, `useScrollEdges`), `web/src/index.css` (`.ui-scroller`). Two strings removed from the catalogs, none added. No data, sync or API change. At 1280×600 with twelve projects, seven are visible instead of two.
