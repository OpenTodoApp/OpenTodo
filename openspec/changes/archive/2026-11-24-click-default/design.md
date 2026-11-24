# Design

## Context

- `click-selects-title` D1: `useRowClicks` in `web/src/app/TaskRow.tsx` records at `pointerdown` (mouse or pen, fine pointer, from 768 px) whether the row was selected; the click then selects, edits the selected title, or, for a click without a recorded press (Enter, Space, assistive technology), opens the task as Enter does.
- Account preferences are fields of the synced `user_prefs` row "me", written with `mutate()` (`task_open`, `row_layout`, …); an empty or unknown value reads as the default and is kept.
- The server's default theme (`theme-instance-default`) is the existing default for members that a member's own choice overrides: set by the owner in Settings → Server, refused on a demo, recorded as `settings.changed`, announced in `auth/status`.

## Decisions

**D1. One account field, three values.** `user_prefs.row_click`: `""` (follow the server, the initial value), `select` or `open`. An unknown value from a newer client reads as `""` and is kept. The row sits in Settings → Appearance → Task details next to **Open tasks**, the other choice about what opening a task from a list does; its first option names the default it follows ("Use the server default (Open details)"), so no description line is needed.

**D2. The server default is a server setting, like the default theme.** Stored under `row_click.default` in the settings table (`select` when missing), set with `PUT /api/v1/settings/row-click` `{default}` by the owner (`ownerOnly`, `.DemoDenied()`, the demo's existing "Server settings" prefix), recorded as `settings.changed`. Settings → Server is the owner's section, and the default theme next to it is owner-only too, so the same policy applies: admins manage people, not server-wide behaviour. `auth/status` carries `rowClick: {default}` for a signed-in caller; the web app mirrors it in `opentodo.rowClickDefault` (absent for `select`), so a start without a connection follows the last default it read. No GET route: the value is in the status every client already reads.

**D3. Open details reuses the click without a press.** Under `open` the row records no press, so its click takes the existing path of a click without a press: the task opens as Enter does (the page, or the side panel or Inbox split where they show), and the title editor never opens on a click. Nothing else changes: `F2` edits, Enter opens, a double-click opens the page, Shift and Ctrl/⌘ clicks tick, touch keeps its rules. The choice is read at the press (`rowClickMode()` from the loaded preferences snapshot and the server default), so changing it re-renders no row and the 2,000-row following budget of `click-selects-title` is unchanged.

**D4. No third choice.** `click-selects-title` D4 removed **Expand the row** and its click path; reusing it would need a new click branch. → and Show details keep expanding.

## Data model

One additive op field, `user_prefs.row_click` (string, default `""`), declared once in `internal/sync/ops.go`; personal scope like every `user_prefs` field, per-field last-writer-wins. One server setting key, `row_click.default`, never synced.

## Interface budget

One settings row in Appearance → Task details and one Server page with one row. No chrome above a list, no task property, sidebar destination, scroll region or shortcut.

## Size

No dependency. The entry chunk gains the small `rowClickPref` module; the first load stays within `web/bundle-budget.json`. No measurable change to the image or memory.
