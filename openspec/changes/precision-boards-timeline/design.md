# Design

## Context

The board (`app/BoardView.tsx`) renders one `.ui-column` per section with `TaskCard` (the row's `card` shape) inside. The timeline (`app/TimelineView.tsx`) draws rows of 32 px with bars made from the shared block recipe (`.ui-block`, surfaces-v2 D1), a red today line, and uppercase section labels. The targets are round-2 `project-board.png` and `project-timeline.png`.

## Decisions

### D1. The column band fills the board's height
The board row stretches its columns (`items-stretch`) and takes the content height. Each `.ui-column` keeps its sunken fill and card radius, so a short column is still a full band. The cards list scrolls inside the band as before (Board scrolling). On phones the band keeps the 88 % width and snapping.

### D2. "Add a task" at the foot of every column
In an editable project, a ghost "Add a task" button follows the last card of every column, not only empty ones. The header's plus stays as the keyboard-reachable shortcut beside the name. Both open the same section quick add, at the foot.

### D3. The card's property row
The card keeps the row's data, with a different arrangement:
- **Title:** clamped to two lines.
- **Property row, leading items:** the date with the calendar icon in its ladder tone, the estimate with the clock icon, and the subtask progress with the circle-check icon. The progress moves here from the counts.
- **Then:** the remaining facts (deadline, start, repeat, blocked, streak, field badges, project and the comment and attachment counts), followed by the label chips.
- **End of the row:** the assignee (`ml-auto`).

The row wraps on narrow cards. The card surface is `bg-raised` with the default border at the first elevation, lifting on hover (surfaces-v2 D8 unchanged).

### D4. The "Add a section" column
On the board, `AddSection` renders as a column-sized button with a dashed input-tone outline, the card radius and the full board height, holding a plus icon and "Add a section". When open, the name field sits at its top. The list layout keeps its small button.

### D5. Timeline rows and group bars
- **Rows:** `ROW_PX` becomes 36 to match the list's comfortable row, and the bar becomes 24 px.
- **Row labels:** body size.
- **Section and "Unscheduled" headings:** drawn like the list's group bar (raised fill, sentence case, the name in the default tone at medium weight, the count faint), across the label column and the axis.

### D6. Bar labels
- **Inside:** a bar of 96 px or more shows the title inside it (truncated), in the block's text tone.
- **Outside, on a shorter bar:** the bar's length in days in the faint tone, after its end.
- **Outside, on a late bar:** "n days late" in the overdue tone instead.

Outside labels take no pointer events, so drags and drops pass through them.

### D7. Late means overdue
`spanOf` sets `late` when the deadline or the due day (viewer's zone) lies before today. It also sets `lateBy`: the days since the deadline when the deadline has passed, else since the due day. A task whose only past date is its start is not late; its past part is dimmed as before. A late bar uses the shared late block, so the overdue tone still takes precedence over the hue.

### D8. The deadline diamond
- **Marker:** the flag becomes a 10 px square rotated 45°, in the warning tone, or the overdue tone when late. It is centred on the deadline day and vertically on the bar.
- **Label:** when the bar has no other outside label, "Deadline {date}" in the same tone follows the bar.

### D9. Today line and mark
- **Line:** the accent colour instead of danger, so red stays reserved for lateness.
- **Mark:** a small accent pill reading "Today" sits on the axis at that day.
- **Week columns:** they read as a range ("20–26 Oct"), formatted with the user's locale.

## Risks

- **Taller rows mean fewer rows per screen.** That matches the list, which already moved to 36 px.
- **An outside label can sit under a dependency arrow.** Arrows are drawn above with a surface halo, so both stay legible.
