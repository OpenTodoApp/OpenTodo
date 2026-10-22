# Proposal

## Why

The calendar, the board, Settings and Statistics draw their structure with outlines: a task block in Day and Week is a white box with a coloured border, a board column has no surface so its cards float on the canvas, every Settings card carries the same border and shadow, and a statistics tile is a plain box. The result reads as a wireframe: the eye gets no help telling a task from a meeting, a column from the page, or the one card on a settings page that matters from the nine that do not. The UX analysis of 21 October 2026 (move 7, "surfaces for calendar and board") found this the clearest gap between OpenTodo and the apps people compare it with, where structure is felt through soft fills and faint sunken areas rather than seen as lines.

## What Changes

- **Calendar blocks are filled, not outlined.** In Day, Week, Month, Plan and the project timeline a task block or row is a soft fill of its project's hue (`bg-hue-soft`) with a 3 px hue edge and strong text, instead of a white box with a coloured border. Past blocks on past days and completed occurrences are dimmed to the faint tone. Blocks of subscribed calendar events are neutral: a sunken fill with a hatched edge and the calendar's colour as a dot in the text, so a task and an event are told apart by shape and texture, never by colour alone. Free events keep their dashed outline. The unestimated block keeps its dashed edge.
- **One now line and a collapsible all-day row.** Day, Week and the Plan's first row show a now line on today; the all-day strip collapses to one row with "+N" when a day holds more than three all-day items, expanded per device.
- **Column headers in the muted tone.** The capacity line of every day header (Day, Week, Month cell, Plan) is muted text with tabular figures in the interface face, not the monospace face; the over-capacity mark keeps the danger tone and its text.
- **Board columns get a surface.** A column sits on a faintly sunken, card-radius surface with its header inside it; the section's colour and icon (change `icons-and-section-style`) and the muted count, and the rule bolt of a board of filters (change `rule-boards`), live in that header. While a card is dragged, the target column shows a dashed drop placeholder sized to the dragged card at the position it would take; a hovered card lifts from the first to the second elevation. An empty column shows its "Add a task" affordance inside the surface.
- **Settings cards come in two tiers.** Each settings page has at most one primary card, the state-first card the page is about (the session card on Account, How you work on Account's first section, the two-factor card on security, the backups card on Server), drawn as today with the raised surface and the first elevation; every other card becomes a flat section: heading, line and rows separated from the next by space and a hairline, no border, no shadow. Rows, copy, anatomy and the settings anatomy test are unchanged.
- **Statistics tiles lead with the number.** The four headline tiles show their value at the display step of the type scale with tabular figures, the comparison line in the muted tone, and the chart panels below become flat sections with the same hairline separation as settings; the tiles keep the card surface.
- **Dark mode and contrast.** Every fill has its dark counterpart from the hue table; block edges, the drop placeholder and the hatched event edge meet 3:1 against their background; text on a soft fill meets 4.5:1 through the existing pairs test. Borders on dark surfaces follow the translucent border token of change `tokens-v2` when it lands and the current border token until then.

Out of scope: the task panel and every dialog or popover surface (they stay as the `web-app` and `design-system` specs describe them); the row anatomy of lists (change `rows-v2`); the colour, type and radius tokens themselves (change `tokens-v2`); how capacity, overlap, projections or events are computed; the month cell's "+N more" rule; the board's phone layout and pager; new settings cards or rows; any chart's data. Nothing is written to the operation log; no API, no environment variable, no dependency.

ROADMAP: advances "Next: Design refresh" (the visual language in the workbench) and the calm-interface direction of `ux-overhaul`; follows the measured audit of `ux-audit-three-widths`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `time-blocking`: "Tasks as calendar blocks" (filled blocks, dimmed past, now line) and "Overlap and capacity" (muted capacity line, tabular figures, neutral event blocks in the layout).
- `calendar-feeds`: "Events drawn in Day and Week" (neutral event presentation told apart from tasks without colour, collapsible all-day strip).
- `month-view`: "Cell contents" (filled task rows, muted capacity line, dimmed past days).
- `project-timeline`: "Bars from start, due and deadline" (filled bars in the project hue, overdue tone kept, dimmed past).
- `sections-and-boards`: "Board view" (column surface, header anatomy) and "Move tasks between sections" (drop placeholder and card lift); an added "Board surfaces" requirement for the states the stories must show.
- `settings-navigation`: an added "Card tiers" requirement (one primary card per page, flat sections for the rest) beside "Panel cards and rows", which `settings-copy` modifies.
- `statistics`: an added "Tile and panel presentation" requirement beside the "Headline tiles" and "Dashboard panels" requirements that `stats-dashboard` adds.
- `design-system`: "Three surfaces" gains the flat section and the sunken column as named styles so the token lint can allow them; "Core screens in the workbench" lists the Month, Plan, timeline, board drag and settings tier stories.

## Impact

- Web only: `web/src/app/calendar/DayColumn.tsx`, `CalendarEvents.tsx`, `CalendarView.tsx`, `MonthView.tsx`, `PlanView.tsx` and `calendar/PlanRow.tsx`, `TimelineView.tsx`, `BoardView.tsx` and `useBoardDrop.ts`, `web/src/ui/patterns/SettingsSection.tsx` (a `tier` prop), the settings panels that name their primary card, `web/src/app/review/StatsView.tsx`, and the component classes in `web/src/index.css`. Tokens are reused; two component classes are added (`ui-column`, `ui-section-flat`).
- Stories and baselines for Screens/Calendar (Day, Week, Month, Plan, the timeline), Screens/Board (drag in progress, empty column), Settings (tiers) and Screens/Review and statistics, in light and dark at 375 and 1280 px.
- Docs: `docs/calendar-views.md`, `docs/sections-and-boards.md`, `docs/settings.md`, `docs/statistics.md` and `docs/interface-guide.md` ("Three surfaces" becomes five) with regenerated screenshots.
- No server change, no data change, no dependency; bundle growth is a few hundred bytes of CSS.
