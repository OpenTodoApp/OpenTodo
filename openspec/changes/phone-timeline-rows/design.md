# Design

## Context

GitHub issue 1372. `web/src/app/TimelineView.tsx` draws one grid inside a horizontal scroller: an axis row, group bars and task rows of `ROW_PX = 36`, each task row a sticky name cell (`w-[40vw] max-w-64`) and a lane with the bar. The day columns (drop targets), the today line and the arrows' SVG are laid over the rows, offset by the name column's width and positioned by row index × 36.

Measured in Chromium with touch on the seeded account (longest names 36, 32 and 30 characters), before:

| | 360 px | 390 px |
| --- | --- | --- |
| Row height | 36 px | 36 px |
| Name button (touch makes every button at least 44 px) | 127 × 44 px, overlapping the next by 8 px | 139 × 44 px |
| Overlapping touch targets (M11) | 3 to 4 | 3 |
| Characters shown of 36 / 32 / 30 | 18 / 18 / 19 | 19 / 21 / 20 |
| Grid visible | 183 px, 5.7 days | 201 px, 6.3 days |
| Hint | 3 lines, 54 px | 3 lines |
| Tap on a name | selects the row; a double tap opens | same |

The hint is one string, so `touch-keyboard-hints` cannot hide its half about keys: the stylesheet hides `.ui-kbd` and `[data-kbd-hint]` where no key can be pressed, and this line carries neither. The audit's screenshot shows the whole hint either way, because the tour presses keys.

## Goals / Non-Goals

**Goals:** rows a finger can hit, names that can be read, more of the grid, no keys in the hint on a phone; nothing different with a mouse from 768 px.

**Non-Goals:** a new timeline for phones, two-line names, changing drag or date rules, the tablet layout beside the sidebar.

## Decisions

### D1. Below 768 px the name is a line above its bar

Two shapes were compared at 360 px (a 326 px scroller): the first built and measured, the second worked out from the measured 7.3 px per character.

| | Name above the bar | Narrower column, two-line names |
| --- | --- | --- |
| Name room | 310 px, one line: about 42 characters | 104 px × 2 lines in a 120 px column: about 22 to 26 characters, "Kitchen cabinets and the counter top" still cut |
| Grid visible | 326 px, 10.2 days | 208 px, 6.5 days |
| Row | 56 px (name 20, bar 24, spacing) | 44 px |

The name above the bar wins on both measures the issue names, and it needs no second line: every seeded name shows whole. Its cost is 12 px of height per dated row. So below 768 px (`DESKTOP_HEADER_QUERY`, the breakpoint the phone bar and the phone row use) a task row is 56 px: the name on one line, then the 36 px lane the bar already sits in, overlapping the name's line by 4 px so the bar's 6 px margin is not doubled. A row without a bar (Unscheduled) is the name alone, 44 px on touch.

The name's text is `position: sticky; left: 0` inside the row, at most as wide as the scroller (`100cqw`; the scroller is a size container), so it stays at the grid's left edge while the days scroll. It is one line with an ellipsis: with 310 px a second line would only matter beyond about 42 characters, and a fixed row height keeps the arrows' positions arithmetic. The name has the canvas colour behind it and is drawn above the today line and the arrows, so a line never strikes through a name.

Alternative: stack by the scroller's own width (a container query), which would also help a tablet in portrait beside the sidebar. Rejected here: the arrows need the row height in script, and the issue is the phone; noted as an open question.

### D2. The row is the name's button; the bar sits on it

Touch makes every button at least 44 px tall, which is what made 36 px rows overlap. On a phone the button fills the row (56 or 44 px), named by the task's title as before (`aria-label`), and the visible name is a decoration over it that lets presses through. The lane lets presses through too, and the bar takes its own, so a bar is still tapped to select and held to drag while everything else in the row opens the task. During a drag the rows stop taking presses, as before, so the day columns under them receive the drop.

From 768 px the row keeps its name cell; its height is 44 px on a coarse pointer and 36 px otherwise, with the 36 px lane centred, so nothing moves with a mouse.

The arrows and the SVG's height are computed from the heights: a line knows how many task rows and group bars are above it, and `rowMetrics(stacked, coarse)` gives the row height and the bar's middle (`38` of 56, `22` of 44, `18` of 36). Group bars and the axis stay 36 px: they are not controls.

### D3. A tap opens

On a coarse pointer the name's click opens the task (`onOpen`); with a mouse it selects and a double click opens, as before, also in a narrow window. A list row opens on a tap, and selecting a row has no use on a phone without keys.

### D4. The hint in two parts

The string is split at its sentence boundary into "Drag a bar to move its dates, or its ends to set the start and deadline." and "← → move the selected task, Shift+← → its deadline."; the second is wrapped in `data-kbd-hint`. Each language's translation was one sentence per half already, so the catalogs are split in the same place and no wording changes. The drag sentence stays: dragging is the one thing the grid does not show. On a phone the hint is two lines instead of three.

### Data model, size

No data model impact: no field, op, route or setting. No dependency. The timeline's code grows by about 40 lines; the first load stays inside its budget (146.6 of 147 KB entry, 706.8 of 708 KB with static imports).

### Interface budget

No chrome is added above the list: the zoom and the hint were there, and the hint is a line shorter on a phone. No new task property, destination, scroll region or shortcut. The grid remains the screen's one horizontal scroller.

## Risks / Trade-offs

- A dated row is 20 px taller on a phone, so fewer rows fit: nine dated rows per 500 px instead of fourteen. Names that can be read and ten days of grid are worth more on a screen where the list was unreadable.
- A press on the empty part of a lane opens the task, since the row is the button. It is the list's behaviour, and a bar is still its own target.
- `100cqw` needs container query units (Chromium 105, Safari 16), which the row styles already use.
- A name longer than about 42 characters still ends with an ellipsis and does not follow Show full task titles here; opening the task shows it.

## Open Questions

- A tablet in portrait beside the sidebar has a 436 px scroller with a 256 px name column: 5.7 days. Stacking by the scroller's width would fix it and is a separate decision.
- With a mouse the name buttons are 20 px tall with 16 px between them, which the audit's target-size rule (M7) reports at 1280 px on main as well. Filling the row's height would fix it; left out because nothing was to change with a mouse.
