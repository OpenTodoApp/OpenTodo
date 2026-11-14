# Design

## Context

GitHub issue 1351. `phone-row-titles` removed the task row's one-line clamp on a phone and named the lists it left alone. What each of them does today, read in the code and seen at 360 px on the built app:

| Place | Row | Title today | Heights |
| --- | --- | --- | --- |
| Notes list | `NoteRow`: a grid of icon, title, place, time on one line | `truncate`; about 125 px beside the place and the time | plain `li`, `min-h-12`; no estimate, no reflow |
| Month, focused day's list (< 640 px) | `MonthRow`, the same component as a cell's row | `truncate` | plain buttons, 44 px by the touch rule |
| Week agenda (< 640 px) | `WeekAgenda` rows, `ProjectedItem` `large`, a block's checklist | `truncate` | `min-h-11` |
| Plan agenda (< 640 px) | the compact row with `large`, `ProjectedRow` `large` | `truncate` | `min-h-11` |
| Day and Week time grid, all-day lane | absolutely placed blocks, lane rows | one line | fixed by the grid |
| Close the day | `TruncatedText` (Done, What moves), a `truncate` span (First thing) | one line; in Done and First thing the project's name is `shrink-0` and can take the whole line | plain lists |
| Command bar | `ComboboxList` with the palette look | `block truncate` | `minHeight` per row; fixed heights only when windowed (over 200 options; the palette stops at 50) |
| Weekly review's Inbox step | the task row | two lines already | — |

None of these lists is virtualised, estimated with `content-visibility` or animated by row height, so a taller row needs nothing else. The command bar keeps its cursor in view with `scrollIntoView`, which does not assume a height.

## Goals / Non-Goals

**Goals:** the same rule as the task row in every list a phone shows; one place for the rule; nothing changes from 768 px; parts beside a title stay on its first line.

**Non-Goals:** the task row, rows fixed by a grid, pickers other than the command bar, a preference, new strings.

## Decisions

### D1. Two classes, not five local edits

`web/src/index.css` gets:

- `.title-phone`: from 768 px exactly what `truncate` does (one line, an ellipsis). Below 768 px, on screens: a two-line clamp with wrapping; `:root[data-titles="full"]` lifts the clamp, as it does for `[data-row-title]`.
- `.title-phone-row`: below 768 px the row's parts align on one baseline, which is the title's first line, and the row's block padding is `(2.75rem - 1lh) / 2`, so a one-line row is 44 px at any text size and a second line adds one line's height. This is the task row's arithmetic (12 px, 20 px lines, 12 px) written once for rows of either text size. The Month's day list is 44 px only on touch (22 px with a mouse in a narrow window), so it names its height there with `--title-phone-row` and stays as it was.

The breakpoint is the task row's: `@media screen and (width < 48rem)`. The phone's rules are outside the cascade layers so they win over a row's own `items-center` and padding utilities; the base is in `components`.

`TruncatedText` takes `wrap="phone"` and uses the class; it already measures height as well as width, so its tooltip and tab stop still appear only while the text is cut.

Rejected: a `PhoneTitle` component (the titles sit in spans, buttons and grid cells with different markup around them; a class fits all of them); lifting `truncate` globally below 768 px (chips, names and figures use it too).

### D2. Which rows take it

A row takes the class only where its height is free. The components shared with a fixed place opt in by the prop that already says "phone list": `large` on the compact row, `ProjectedRow` and `ProjectedItem`; a new `list` on `MonthRow`, set where the Month is narrower than 640 px (its cells show counts there, and between 640 and 767 px a cell's row stays one line). The command bar's option takes it only with the palette look and only when the list is not windowed.

Not changed, and why:

- Day and Week grid blocks, the all-day lane: a block is positioned by time; the lane is the grid's header and is kept short on purpose (it folds when it grows).
- Month cells, Plan columns: a cell shows a fixed number of rows.
- Deadline markers, calendar events, a block's own "Admin · 16:00–16:45 · 2 of 5" row: not a task's title, and the figures at the end must stay.
- The command bar's context chip, its second line, the default-look pickers: a chip; a path or snippet; pickers are a different job (`phone-row-titles` non-goal too).
- Board cards: two lines already. Statistics tables and the review's bento cards: not looked at beyond their code; they keep one line.

### D3. The Notes row on a phone

The title shared its line with the place (up to 80 px) and the time. Wrapping it in what was left gives two lines of about 12 characters. So below 768 px the grid has two rows: the title across the row, and under it the time, then the place. Time first, because it is always there and short, so the place starts at one x when present and can use the rest of the line. While searching, the snippet wraps to its own line under the title instead of sharing a line with it.

A phone's note row is therefore 50 px with a short title (was 48) and 70 px with two lines. This is the one place where a short title's row changes; the alternative kept the row and left most titles cut.

The kind icon sits on the first line. The row's menu aligns to the row's top, so it is at the same place on a row of any height.

Rejected: keeping place and time on the first line (see above); dropping the place on a phone (it tells a task's note from another's).

### D4. Close the day's project names

In What got done and Tomorrow's first thing the project's name does not shrink, so a long one pushed the title out. Below 768 px it is capped at a third of the line. What moves already puts the project under the title.

### D5. Heights and the first line

Measured in Chromium at 360 px (touch) on the built app with the layout check's account plus long titles: every `.title-phone` is at most two lines; with full titles none is cut; one-line agenda rows are 44 px; every part of a `.title-phone-row` has its centre within the title's first line and overlaps nothing; no page scrolls sideways. At 768 and 1280 px every such title is one line, and the 1280 px screenshots of Notes, Month, Week, Day, Plan, Close the day, the review and the command bar are pixel-identical to the build before the change (apart from data that differs between two seeded accounts).

## Risks / Trade-offs

- **Notes rows are taller on a phone**: about 13 short-titled notes per screen instead of 14.
- **The preference's spec sentence.** `appearance-preferences` says the calendar's compact rows keep their shapes with full titles on. On a phone's agenda that is no longer so. `phone-row-titles` already modifies that requirement and is not archived, so this change states the phone behaviour in its own requirement instead of modifying the same one twice; when both are archived the sentence should read "from 768 px".
- **`1lh`** is already used by quick add; a browser without it keeps the row's own padding and the parts fall back to the top of a taller row.
- **A coarse tablet from 768 px** keeps one line, like the task row's phone rule.

## Data model, size, interface budget

- Data model: none. No op, no field, no preference; the existing `full_titles` is read as before.
- Size: no dependency. The stylesheet grows by five rules; the first-load script is unchanged. Image size and memory are unchanged.
- Interface budget (`docs/interface-guide.md`): no chrome above a list, no task property, no sidebar destination, no scroll region and no shortcut is added. A note row shows the same four facts in two lines.
