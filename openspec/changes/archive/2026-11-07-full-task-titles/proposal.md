## Why

Some people write long, prescriptive task titles (the steps of a process they repeat) and work from the list (GitHub issue 998). A list row cuts the title after two lines, and a phone row after one, with an ellipsis; the whole title is only in a tooltip on a pointer device, the task page and the panel. Opening each task to read its title adds friction to the work the list is for.

## What Changes

- A new synced appearance preference, **Show full task titles** (`user_prefs.full_titles`, `"on"` or empty, off by default), in Settings → Appearance after Task rows, found by the settings search ("full task titles", "truncate", "wrap").
- While it is on, every task title in list rows (Inbox, Today, Upcoming, projects, labels, filters and the other lists), on board cards and in Today is shown whole, wrapped onto as many lines as it takes, at every width; the phone row grows past its one line and keeps its end cell on the title's first line. Nothing is cut, so no title tooltip is needed.
- Long lists keep their scroll height close: the row height estimate behind the blocks of rows is measured again when the preference changes.

Out of scope: the calendar's compact rows (Plan, Week, Month, Day), timeline bars, the palette, the sidebar schedule and other one-line task mentions, which keep their own shapes; a per-list or per-device choice. Advances no ROADMAP.md item; a request from issue 998.

## Capabilities

### New Capabilities

### Modified Capabilities
- `appearance-preferences`: the full task titles preference.

## Impact

`internal/sync/ops.go` (one additive `user_prefs` field, regenerated `web/src/generated/opSchema.ts` and the schema fixture), `web/src/lib/fullTitles.ts`, `web/src/app/AppearanceProvider.tsx`, `web/src/app/AppearanceSection.tsx`, `web/src/app/TaskRow.tsx`, `web/src/app/task-list/ListGroups.tsx`, `web/src/index.css`, the settings copy and search index, the strings in every shipped catalog, `docs/sync.md` and the appearance docs. No new route, environment variable or dependency; no **BREAKING** change to the op log.
