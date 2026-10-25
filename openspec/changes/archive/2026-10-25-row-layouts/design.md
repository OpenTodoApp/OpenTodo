# Design: one-line and detailed rows

## Context

`rows-v2` D1 retired the old Calm/Detailed preference (`row_detail`) so that rows are designed once. Issue #367, accepted by the owner, asks for a detailed layout again, with priority readable without colour. Display options already exist on views (0.11.0) and, with `list-display-options`, on projects and labels.

## Decisions

- **D1 A new field, an account default and per-list choices.** `row_layout` (`"line"` | `"detailed"`, a string so later layouts stay additive) on `user_prefs` (the account's layout), `view`, `project_prefs` (personal, so a shared project's members each keep theirs) and `label` (personal). On a list `""` follows the account; the account's `""` reads as `"line"`. Unknown values read as the fallback and are never rewritten. One op per change; per-field LWW. The retired `row_detail` is not reused: its stored values come from an older client's Calm/Detailed choice and would change people's rows without their asking. All four fields go into `internal/sync/ops.go` Schema, the fixture, `types.ts` and the defaults in `ops.ts`; none is user text. The account's default lives in Settings › Appearance next to Density, because Today, Upcoming, the Inbox and search have no display options of their own and adding a panel to each for one choice would add chrome; views, projects and labels choose in their existing Display options (where the issue's other options live).
- **D2 Detailed row anatomy.** Title (up to two lines), the parent name when the parent is not shown above (`breadcrumb`, the same value one-line rows show), then one details line: date and time, priority mark with text, deadline, start, project with dot, estimate, assignee, then sample, blocked, streak and field values, and the labels in a flexible cell that holds as many chips as its width allows, then "+n" (`LabelChips fit`: every chip stays in the page to be measured; a `ResizeObserver` recomputes; the full list is visually hidden text and a tooltip). The details line wraps (`flex-wrap`), so a phone or a large text size adds lines instead of clipping. A detailed row has no time column (the time is with the date) and opts out of the property column and the phone's one-line rule through `data-row-layout="detailed"` (CSS outside the layers, after the column's rules). Hidden properties of a view (Show on rows) are left out as on one-line rows. Cards and compact rows keep their shapes. Interface budget: no new chrome row (the choice sits in existing panels and Settings); the detailed line shows the same seven-or-fewer properties a row already may show; no new shortcut.
- **D3 Priority mark.** Bars from the icon set (`signal-high`, `signal-medium`, `signal-low`: three, two and one bars) in the priority's token colour (`text-p1`…`text-p3`), so the level is a shape as well as a colour; priority 4 has none. One-line rows show it after the title (beside the repeat mark), read as "Priority n"; detailed rows add the text "P1"–"P3". The checkbox ring keeps its colours. High contrast mode already darkens the priority tokens to 7:1 as text.
- **D4 Naming.** The choices are "One line" and "Detailed" (the issue's "compact" would clash with the Density setting's "Compact", which tightens spacing). The control is "Rows" in Display options and "Task rows" in Settings.
- **D5 Where the layout reaches a row.** `TaskRow` takes `layout`; without it, it reads the account's layout from the shared user-prefs snapshot (`useAccountRowLayout`), so every list follows the account without threading props. Lists with options pass theirs: `TaskListView` (projects, labels) through `rowRenderer`, `SavedViewView`, `FilterView`.

## Data model impact

Additive op fields only, as listed in D1; the REST views API accepts `row_layout` (`""`, `line`, `detailed`). No migration, no dependency; five interface icons (about 1 KB in the main bundle).

## Risks

- Detailed rows make lists longer; it is opt-in per account or per list.
- The fit measurement runs per row with labels; it reads widths once per resize, not per frame.
