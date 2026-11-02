## Context

GitHub issue 650: at a medium window width the Inbox's titles were cut beside an empty area, and zooming out brought in an empty "No task selected" pane. Measured on the unfixed build with ten Inbox tasks: at 960 px the row was 630 px wide, its trailing group held 144 px free and the title stopped there; at 1100 px the empty pane took 462 px and the row had 308 px, 88 px of it for the title.

## Decisions

### D1. Two lines, then an ellipsis
The title is `line-clamp-2` in every row shape (the card and the detailed row already were), with `break-words` for long links. The marks beside it (priority, repeat, counts) sit on its first line (`items-start`). In the one-line layout from 40 rem the property column and the Inbox's source line align to the start of the grid row with the title's line height, so they stay on the first line. A `max-width: 48rem` on the title in that layout keeps a readable measure on very wide lists; the column stays at the row's end. The phone row (under 768 px, under 40 rem) overrides the clamp to one line, as its spec requires.

Rejected: a measure on the whole list (a centred column) — it brings back the empty area the issue is about at medium widths.

### D2. The revealed actions float at every width
The trailing group no longer takes `min-w-36` (`min-w-8` for a viewer) on a fine pointer from 768 px. The cluster is already absolutely placed at the row's top right on the popover surface, so it covers the end of the title's first line while shown, as it covers the end of the property column on a one-line row. Nothing moves on hover, so the row's height is stable. Keeping room only while hovered was rejected: the title would rewrap under the pointer.

### D3. The whole title while it is cut
The open control is named by its text, which is the whole title (`line-clamp` is visual), so assistive technology always has it. A pointer gets the Tooltip primitive with the title, enabled only while the title is cut. "Cut" is measured by `useOverflowing`, a hook over one ResizeObserver shared by every element on the page (a list of 2,000 rows registers 2,000 elements on one observer rather than creating 2,000 observers). The native `title` attribute is not used (design system: screens never do).

### D4. The empty pane needs room
`SPLIT_EMPTY_QUERY = (min-width: 90rem)`, the step where `--panel-w` already widens to 30 rem. Below it, `PanelHost` does not render the Inbox's empty pane; a task under the cursor still docks from 64 rem (`SPLIT_QUERY`), so the pane appears with a task and leaves with it. At 1440 px with the default pane (42 vw, about 600 px) and the sidebar, the list keeps about 36 rem. The side panel kind (`task-side-panel`) is not gated: the user opened that panel and closes it, and its spec requires the slot to stay in place while it fills.

## Data model

None. Presentation only.

## Interface budget

No chrome, property, destination, scroll region or shortcut changes. A long title takes a second line, so a list shows fewer rows when titles are long; rows with short titles are unchanged. Bundle: a few hundred bytes.

## Risks

- A two-line row is 20 px taller; lists of long titles scroll more. The clamp bounds it at two lines.
- The cluster covers the end of the first title line while hovered; the title is still readable in the tooltip after the hover delay and in the panel.
