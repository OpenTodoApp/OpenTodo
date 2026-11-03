## Context

GitHub issue 844. The list row is a flex line: leading slot, checkbox, time column, the open control (`flex-1 min-w-0`, holding the title, its marks and the properties), the trailing group with the origin, the disclosure. The origin chip is `shrink-0` up to 10 rem, so on a 340 px row it kept its width and the open control shrank. An import's id is `<16 hex digits>:<n>` for Todoist (a hash of project, section, parent and title; `internal/importer/profile_todoist.go`), the source app's id for the others. On the phone row the open control is a grid `minmax(0, 1fr) auto`: the title in cell 1/1, the one phone cell in 1/2; the Inbox's source line had no placement, so it was auto-placed into the free 1/2 cell, and the `auto` track grew to the line's full width.

## Decisions

### D1. What a narrow row shows, in priority
Under 40 rem of row width: the checkbox, the time column when the task has a time, the title (one line on a phone, two elsewhere), its marks (priority, repeat), the one phone cell (the date, else the deadline, else the assignee, else the project's dot), the disclosure. The origin is the lowest: on a phone not at all (the row's details and the task page show it), and on a row under 30 rem elsewhere (a narrow list column on a wide screen, whose title still wraps to two lines) as its icon, the words visually hidden and kept in the link's name. From 30 to 40 rem the chip keeps its words: a 10 rem chip still leaves the title about 20 rem there, and the existing narrow stories (a 40 rem list) keep "o/r#7" and "example.org". On the phone the Inbox's source line is placed at grid row 2 across both columns, under the title.

Rejected: letting the chip shrink with an ellipsis. A shrinking chip still competes with the title, and a cut hash reads no better than a whole one.

### D2. An imported origin in a row
`rowOrigin` in `web/src/lib/taskOrigin.ts` is the one rule for rows and cards: an `import` origin without a URL is not shown; with a URL (a Trello card) the chip is `iconOnly`, the download icon as a link, the id in its accessible name and the "From" text. Everything else is unchanged. The shared `originLabel` and `internal/origin` `Label()` keep the id, since the panel, the details, history and the CLI show it as a reference; the shared vectors do not change.

## Data model

None. Presentation only.

## Interface budget

No chrome, destination, scroll region or shortcut changes. A row shows fewer items, never more.

## Size

A few lines of TypeScript and CSS; no dependency, no bundle budget change.
