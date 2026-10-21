# Proposal

## Why

A board of filters (a saved view of kind `dashboard`, "Boards" in the interface) shows up to six saved filters side by side, but it is read-only: a card can be completed or opened, nothing else. The project board, by contrast, is a working surface because its columns are sections and dragging a card between them *is* the change. A board of filters has no such meaning for a drop, so the morning review happens on the board and the actual re-planning (change priority, move the date, add a label) happens card by card in the detail panel. Giving each column a small, explicit **on-drop rule** turns the board into a place where sorting work is done, and it makes the Eisenhower matrix (urgent × important) a board the app can ship ready-made, since its four quadrants are four filters with four rules.

## What Changes

- A saved list view gains an additive, optional **`on_drop` rule**: the field changes applied to a task dropped into the column that shows this filter. A rule is a set of at most one choice per kind: add labels, remove labels, set priority, set the due date (today, tomorrow, next week, clear), set the start (someday, clear), set the section of a project, complete or reopen. Rules are edited on the board (in **Arrange**) and through the API; they sync like every other view field and work offline.
- **Dragging a card** from one panel of a board to another, or pressing `Shift+←` / `Shift+→` on the selected card, applies the destination column's rule to that task as one batch of ordinary field operations, undoable in one step through the existing undo toast. A column without a rule is not a drop target. The source column has no "leave" rule: the destination's rule is the whole meaning of the drop (see design, D3).
- If the task does not match the destination's filter once the rule has run (its filter asks for something the rule cannot set, such as a deadline), the destination keeps showing the card, marked, until the user leaves the board, and the toast says so; nothing else is written.
- **New board** on Filters → Boards offers two starting points: an empty board as today, and the **Eisenhower matrix**: four saved filters over priority and date with the matching rules (Urgent and important → priority 1, due today; Important, not urgent → priority 2, due next week; Urgent, not important → priority 3, due today; Neither → priority 4, no date), composed into one pinned board. The template is written as ordinary views through the op log, so the user can rename, edit or delete any part of it.
- The views API and the export carry `on_drop`; the API validates it (allowed keys and values, existing labels, a section of the named project, list views only). Devices running an older client ignore the field and keep working.
- No new dependency, route, env var, sidebar destination or data table. Two new shortcuts (`Shift+←` / `Shift+→` on a board) registered without conflict.

Out of scope: swimlanes and column limits (ROADMAP "board swimlanes and column limits", still set aside), rules that run on a timer or on any trigger other than a drop (the general "rules" item stays set aside; this change covers its board half), rules on project boards (a section already is the rule there), sharing boards with project members, rules on the panels' "Open view" list screen, the CLI (it has no views command), and the in-app assistant or MCP tools editing rules (they write ordinary view fields through the API if they need to).

Advances ROADMAP.md: `custom-views` (dashboards become working boards) and, partially, the set-aside "rules" item (rules fired by a drop, not by time).

No new environment variable. The op log format gains one additive view field; nothing is renamed or removed. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `custom-views`: the "Saved view entity" requirement gains the `on_drop` field; the "Dashboards" requirement gains drop targets, the keyboard move and the held-card behaviour; the "Views API and export" requirement gains the field and its validation. New requirements define the on-drop rule, how a drop applies it, the Eisenhower board template and the "New board" chooser.

## Impact

- Server: `internal/sync/ops.go` (a `kRule` kind and the `view.on_drop` field), `internal/httpapi/views.go` (`checkView` validates the rule; `on_drop` on dashboards and unknown keys are refused), tests in `internal/sync` and `internal/httpapi/views_test.go`; the export needs no change beyond the field reaching the row.
- Web: `web/src/lib/types.ts` (`OnDropRule`, `View.on_drop`), `web/src/lib/ops.ts` (`VIEW_DEFAULTS`), a new `web/src/lib/rules.ts` (pure planner from a rule to field changes, reusing `planPriority`, `planDue`, `planLabels`, `planComplete`, `planReopen`, `planProjectChange` from `lib/bulk.ts` and `lib/ops.ts`), a new `web/src/lib/boardTemplates.ts` (the Eisenhower views), `web/src/lib/views.ts` (`setOnDrop`, the template writer), `web/src/app/DashboardView.tsx` (drop targets, card drag, the held card, the rule editor in Arrange), `web/src/app/ViewsView.tsx` (the New board chooser), `web/src/lib/shortcuts.ts` (two entries), i18n strings in `web/src/locales`.
- Docs: `docs/saved-views.md`, `docs/filters.md` (the Dashboards bullet), `docs/api.md` (view fields), `docs/sync.md` (view fields), `docs/keyboard.md`, the in-app help page `dashboard`; new screenshots of the Eisenhower board.
- Bundle: about +7 KB gzipped (rule planner, rule editor, template, drag wiring). Binary: about +15 KB (rule validation). Image size and runtime memory unchanged.
- API: `on_drop` on `/api/v1/views` (list, get, create, patch) and in the export's `views` array. No new route.
