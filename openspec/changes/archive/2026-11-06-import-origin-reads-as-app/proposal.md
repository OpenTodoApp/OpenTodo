## Why

After a Todoist import, every task in a project's list view showed a random-looking id at the row's end, and the date and label cells of those rows sat further left than on the rows without one (GitHub issue 945, v0.22.0, Firefox on a Mac). The id is `<16 hex digits>:<n>`, the key the Todoist importer keeps for duplicate detection; `originLabel` returned it as the origin's label. `row-title-first-on-phones` (#853, after 0.22.0) took it out of rows and cards, but the task panel, the expanded details, the history, the command palette and `ot list` still read it, and a Trello card's link still said it to a screen reader. The misalignment has its own cause: the trailing group after the property column was as wide as its content, so any row with an origin (an issue, a page) pushed its column left of the others.

## What Changes

- An imported origin reads as the app it came from everywhere: `originLabel` and Go's `Origin.Label()` return the app's name ("Todoist", "Microsoft To Do"; the provider as stored when unknown); the panel, details, history, palette and the Inbox's source line read "Imported from Todoist"; a Trello card's icon link is named "Imported from Trello". The id is never shown or read out. The stored origin, export, import and duplicate detection do not change.
- From 40 rem of row width every list row has its trailing group, with an origin or empty, at one fixed width (6 rem), so the property column ends at the same place on every row; a longer origin ends with an ellipsis, its words in its link's name and the details.
- A story with imported rows and a Playwright check in the UI check measure the alignment at 1280, 768 and 390 px and fail on any import id in the list.

Out of scope: the importer's ids and duplicate detection, the origin vectors' recognition cases, cards (their origin is already at the card's corner), rows under 40 rem (no column to align). Advances no ROADMAP.md item; a fix for #945.

## Capabilities

### New Capabilities

### Modified Capabilities
- `task-list-presentation`: the row's end is one width from 40 rem; an imported origin reads as its app in the details, panel and history, never its id.
- `data-import`: an imported origin's id is never shown; it reads as the app it came from, in the app and in the CLI.

## Impact

`web/src/lib/taskOrigin.ts` (`originLabel`, new `importApp`, `originText`), `web/src/app/OriginChip.tsx`, `web/src/app/TaskRow.tsx`, `web/src/index.css`, `web/src/lib/history.ts`, `web/src/lib/taskSource.ts`, `web/src/app/palette/index.ts`, `internal/origin` (`Label`, `ImportApp`) and its shared label vectors, the story `Screens/Task row` ImportedAlignment, `scripts/ui-check/alignment.spec.ts`, the visual baselines of list rows at 1280 px. No data, op, API, dependency or setting changes; works offline as before.
