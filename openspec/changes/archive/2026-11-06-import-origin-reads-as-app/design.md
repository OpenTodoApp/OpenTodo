## Context

GitHub issue 945. An imported origin is `{kind: "import", provider: <profile>, id: <source id>}` (`internal/importer` `importedOrigin`); for Todoist the id is a hash of project, section, parent and title plus a counter. `originLabel` (web) and `Origin.Label()` (Go) returned `id || host`, so every reader of the label showed it: the row chip until #853, then still the panel's origin facet, the expanded details, the history ("origin: dfc92cb10aed05a4:1"), the palette's secondary line, `ot list`'s origin column, and the accessible name of a Trello card's icon link.

The row is a flex line: leading slot, checkbox, time column, the open control (`flex-1`, a grid from 40 rem with the property column in fixed tracks at its right end), the trailing group, the disclosure. The trailing group existed only when the row had an origin or revealed actions, and was as wide as the origin, so the open control, and with it the property column, ended at a different place on each row.

## Decisions

### D1. An import reads as its app
`originLabel` returns `importApp(provider)` for kind `import`: a fixed table of the importer profiles' names (`todoist` → "Todoist", `microsoft-todo` → "Microsoft To Do", …), the provider as stored when not in the table, "" without one. Go's `Label()` returns the same through `ImportApp`; the shared label vectors pin both. `originText` (moved from `OriginChip` to `lib/originText.ts`, so `history.ts` and the palette use it; kept out of `lib/taskOrigin.ts`, which the entry chunk imports, so the translations stay out of it) makes it the words "Imported from Todoist", else "Imported", both existing catalogue strings. The chip's link and menu are named by that text itself rather than "Opens the source …", which would read "Opens the source Imported from Trello".

Rejected: dropping the origin facet for imports. Where a task came from is still worth a line in the details; only the key is not.

### D2. The row's end is one width
Every list row renders its trailing group, empty or not (a row edited in place keeps its old rule). From 40 rem of row width the group is `flex: none; width: 6rem` and its chip may shrink (`min-width: 0`), cutting the text with the existing ellipsis. 6 rem holds the icon and about ten characters ("o/r#7", "example.org"); the whole text stays in the link's name, the tooltip and the details. Under 40 rem there is no column to align, so the group keeps its content width (and on the phone row it is hidden, as before). A detailed row has no column and keeps the content width.

Rejected: reserving the slot only when some row of the list has an origin. Lists render rows lazily, so a row with an origin scrolling into view would move every other row's column.

## Data model

None. Presentation only; the stored origin, export, import and duplicate detection are unchanged.

## Interface budget

No chrome, destination, scroll region or shortcut changes. A row from 40 rem gives up to 6 rem at its end to the fixed group, which the title's width absorbs; the property column's cells and their drop points are unchanged.

## Size

A few lines of TypeScript, CSS and Go; no dependency. The first load grows about 0.7 KB gzip (the app-name table and `lib/originText`); the budget goes from 678 to 679 KB (web/bundle-budget.json).
