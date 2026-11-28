# Design

## Context

The phone UI (`web/src/phone/`, chosen in `Shell.tsx` below 768 px) draws every screen with its own header, rows and cards; the shell draws the tab bar and the add button for all of them (`app/TabBar.tsx`, `app/phoneFrame.tsx`). Tokens live in `web/src/index.css`. The owner asked for a more modern and attractive look with free hands; the bar of `CLAUDE.md` still applies: no taglines or helper text, simple layout.

## Decisions

### D1. The tab bar floats, the add button sits beside it

The bar is a capsule: `rounded-full`, a hairline, `shadow-3`, the surface at 90 % with a blur behind it, 12 px from the sides and 8 px above the safe area (`TAB_BAR_FRAME`). Tabs stay 56 px; the bar is 64 px with its padding (`TAB_BAR_HEIGHT_REM = 4`). The current tab is on a `bg-selected` pill and stays in the strong tone, never the accent, as "Phone navigation" asks.

The add button is a 64 px circle at the bar's end, on the same baseline; the bar ends 5.25 rem from the edge while the button is offered and runs to the gutter when it is not (Settings, the rituals) or when the bar is minimised and the button slides out (`tabBarFrame(withAdd)`). The cold-start skeleton draws the same frame with the button's room, as on every list.

The content scrolls under the bar: the room the shell keeps is the scroller's own bottom padding, not the frame's, and it is measured from the bar's top to the bottom of the screen (`--tab-bar-h`), since the bar's own height leaves out the gap under it. With the button beside the bar, the room past the bar for the button is a 1 rem gap (`--add-room`), and the toast lifts 1.25 rem above the bar.

Alternative: keep the button floating above the bar's end. Rejected: it covers the last rows' metadata, which is why every list reserved 4.75 rem for it.

### D2. Widgets read what the list already holds

Today at a glance (`TodayGlance`) and Upcoming's week (`WeekStrip`) count nothing new. The tiles read the open tasks Today lists (`useListScreen`'s `listedTasks`), every task completed today (`m.allTasks`, a skipped habit day excluded, so the ring is right while Done today is hidden) and the Earlier group's size; the strip reads the day groups Upcoming builds. A tile or a day that has nothing to show is left out or cannot be chosen, never an empty card with a label. Up next opens the task with the push transition, as a row does; Late and a day scroll the list to their group.

No preference turns them off: they replace nothing and add one row each above the list. Their words are two new strings ("Up next", "Next seven days"); the rest reuse "Done today", "Late", "Today" and the task-count plural.

### D3. Light and radius

`.phone-glow` is two radial washes of the accent and the info tone at 22 % and 14 %, behind the title (`z-index: -1` in the screen's own stacking context), 22 rem tall and fading before the first rows, left out of print. The phone header is clear until the title has scrolled away, then the canvas at 85 % with a blur and its hairline, so the light shows through at the top and the rows never do.

`--radius-phone-card` (16 px) is the radius of a card of phone rows, a tile, the task page's fact cards and the date sheet's groups. A desktop card keeps `--radius-card`.

### D4. The task page's fields as tiles

`FactChips` draws the fields that have no value as a three-column grid of tiles (icon over name, at least 72 px tall), the same targets as before and the same sheets; a long name wraps to two lines inside its tile.

## Risks / Trade-offs

- **Blur on older phones.** `backdrop-filter` costs on low-end Android web views. The bar and the header are two small areas, and the bar at 90 % stays legible where blur is missing.
- **Visual baselines.** Every story at phone width shows the new bar and radius: their baselines are regenerated with this change.
- **The layout check's rules about the add button's footprint** (the last row clear of the button) hold with the smaller room because the button no longer reaches above the bar; the layout check and the end-to-end phone script verify it.
