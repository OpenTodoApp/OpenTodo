## Why

After importing a Todoist backup, a phone (the Android app at about 390 px, v0.20.0) showed every task title cut to one to four characters (#844). Two things took the row. In projects, Today and Upcoming, the origin chip at the row's end read the import's id, `dfc92cb10aed05a4:1`: a key the Todoist importer makes for duplicate detection, meaningless to a person, up to 10 rem wide and never shrinking. In the Inbox, the source line "Imported from todoist · 19 h ago" was meant to be the row's second line, but the phone row's grid placed it beside the title in the auto-sized column, so it took the title's width. Measured in the story on main at 390 px, the titles had 1, 18, 39 and 64 px.

## What Changes

- An imported origin (kind `import`) never shows its id in a row or on a card: without a link (every import except Trello) the row carries no origin item; with a link (Trello) the item is its icon alone, still a link, the id in its accessible name. The task's expanded details and panel show the origin as before.
- On a row narrower than 30 rem (a narrow list column on a wide screen) every origin item is its icon alone; on a phone (under 768 px) the origin is left to the row's details and the task page, as the phone row already does for the other properties.
- On a phone the Inbox's source line is the line under the title.

Out of scope: how origins are labelled elsewhere (`originLabel`, `internal/origin` `Label()`, the CLI, history, the panel keep the id), the importer's ids, rows from 40 rem with the property column. Advances no ROADMAP.md item; a fix for #844.

## Capabilities

### New Capabilities

### Modified Capabilities
- `task-list-presentation`: a narrow row keeps its title; an imported origin's id is not shown in rows and cards.
- `data-import`: imported origins show in the task's details and panel; a Trello card's link stays the row's icon.

## Impact

`web/src/app/TaskRow.tsx`, `web/src/app/OriginChip.tsx`, `web/src/lib/taskOrigin.ts` (`rowOrigin`, client only; the shared origin vectors are unchanged), `web/src/index.css`, the story `Screens/Task row` ImportedOrigins and the visual baselines of rows with origins. No data, op, API, dependency or setting changes; works offline as before.
