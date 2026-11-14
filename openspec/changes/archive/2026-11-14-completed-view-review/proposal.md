# Proposal

## Why

People review their work by looking back over the last weeks (#1325, from discussion #172). The Completed view lists every completion by day, but it cannot be narrowed to the projects under review or searched, and a long list of struck-through titles is hard to read.

## What Changes

- **Display options of its own.** The Completed view's display button offers Group by (Day, the default, or Project) and the projects it is narrowed to, chosen with the Combobox, the Inbox included; none chosen shows every completion.
- **Search.** A search field where the other lists have their quick add narrows the shown completions to those with every word in the title or the notes.
- **A readable done marker.** In the Completed view, where every row is done, a row shows its check and a muted title without the strikethrough. Everywhere else is unchanged.
- **Device state.** The options are kept on this device and never synced; the search is not kept.

Not **BREAKING**: no op field, route or environment variable.

Out of scope: a logbook layout for saved views, a device-wide choice of the done marker, and a link from the weekly review.

Roadmap: the "Views and lists" area of ROADMAP.md.

## Capabilities

### Modified Capabilities

- `web-app`: Completed logbook.

## Impact

- Web: `web/src/lib/completedDisplay.ts` (options and filtering), `web/src/lib/logbook.ts` (grouping by project), `web/src/lib/listGroups.ts`, the Completed view's search row and display button (`web/src/app/completed/`, the panel loaded lazily), the row's done marker.
- Docs: the Completed row of `docs/built-in-views.md`.
- Size: about 0.6 KB on the first load (budget raised to 705 KB); the search row and the panel load with the view.
