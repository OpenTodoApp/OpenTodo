## Decisions

**D1. Search moves next to the name, not into the footer row.** Seven icon buttons do not fit the footer of a 15 rem sidebar (216 px of content width: a 40 px bell, five 32 px buttons and the sync dot are already 216 px with gaps). Next to the name it is the first control in the sidebar, where search sits in most apps, keeps its tooltip with the shortcut and its `data-palette-button` hook. Usability kept: still one click, still announced as "Search and commands" with `aria-keyshortcuts`.

**D2. Help joins the footer row only from 768 px.** The phone drawer is 256 px wide and touch targets are 44 px, so six of them would not fit; there the footer keeps Help as a row and the bar at the bottom of the screen already has Search.

**D3. More is a menu only with a fine pointer from 768 px.** A dropdown keeps the projects in place and saves the whole group's height; on touch screens a long menu over the drawer would be awkward, so the inline group (now scrolling with the rest) stays. The More row carries the review and unread markers like the closed group did; inside the menu they are each item's description, so they are read with the item. The row is marked current while one of its destinations is open.

**D4. Empty groups are hidden, not shrunk.** Filters shows as soon as there is any saved filter, pinned or not, so its All action (the saved filters page) is reachable whenever there is something to manage; the first filter is saved from the Filter view, which stays in More. Labels shows with the first label; labels are created from quick add (`@name`), the label picker and the labels page (`g l`). Projects always shows: it holds the find opener and the add menu.

**D5. Density follows the pointer, not the width.** `pointer-fine:` variants make rows 32 px and headings tighter only for a mouse or trackpad, so a touch laptop or tablet keeps 36 px rows and the 44 px targets the layout check enforces.

**D6. Scrollbar and fades are CSS on one class.** `.ui-scroller` sets `scrollbar-width: thin` and colours from the border tokens (so light, dark and the high-contrast themes follow), stronger on hover or focus. `useScrollEdges` toggles `data-fade-top` / `data-fade-bottom` from scroll position, size and content changes; the mask covers the content column only, so the scrollbar thumb never fades. A list that fits has no fade and the sticky group headings sit below the 0.75 rem top fade.

## Size

A few hundred bytes of CSS and script; no dependency.
