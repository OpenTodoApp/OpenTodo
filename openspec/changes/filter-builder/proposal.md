# Proposal

## Why

A filter is a formula: `@work & (due <= tomorrow | p1) & !@waiting`. The grammar is rich (labels, projects, priorities, five date fields with periods, keywords, text, origins, tracked time, custom fields, and `&`, `|`, `!` with parentheses), and the only way to write one is a single monospace text field. The owner's feedback: "Formula combine conditions. This is a complex UX, right now we solve it with very basic UI. I want a modern, cool, beautiful way to combine and see formula."

Today a person has to know the grammar, remember that `&` must be written out, and read precedence (`a & b | c`) in their head. Saved filters show the same text field. Nothing shows how the conditions combine.

## What Changes

- **A visual builder.** The Filter view and saved filters get a builder that shows the query as conditions and groups:
  - Each condition is a chip that reads in words: "Label is errand", "Due on or before tomorrow", "Priority is P1", "No project", "Title or notes contain oat milk".
  - A group is a visible block headed **All of these** (and) or **Any of these** (or), with **+ Condition** and **+ Group**. Groups nest up to three levels deep.
  - **Not** turns on per condition and per group.
  - A condition is edited in a small dialog: pick what to filter on, then the value with the app's own pickers (the Combobox for labels and projects, choices for dates, the four priorities, a list of the state keywords, fields and text inputs).
  - A live count shows how many tasks match.
- **Two-way with the formula.** The formula field stays under the builder and stays the source of truth:
  - Typing in it updates the builder as soon as it parses.
  - Every change in the builder rewrites the formula with as few parentheses as the grammar needs.
  - A formula the builder cannot show (a double `!!`, or groups nested deeper than three levels) stays editable as text, with a short notice instead of the builder.
- **The stored format does not change.** A saved filter still stores the formula string. Sync, the server's validation, the API, `ot`, MCP and the assistants see exactly what they saw before.
- **The builder can be folded away.** A **Builder** toggle beside the formula shows or hides the builder, remembered per device and per screen. It is open by default in the Filter view, which is an editing screen, and closed by default on a saved filter, whose results matter most.
- **Keyboard and phone.**
  - Inside a group, the arrow keys move between chips, and Delete or Backspace removes the focused one.
  - Every control is reachable with Tab.
  - At 360 px the chips stack and the targets are 44 px.
- **A printer that round-trips.** A new formatter prints a parsed query with minimal parentheses, so that parse → print → parse yields an equal tree for every construct of the grammar. Tests pin it against the documented examples, the edge forms the Go parser's tests list, and generated trees.

Out of scope:
- Natural-language filter input ("tasks for work due this week"); the assistant already covers that.
- New grammar: the builder only shows what the formula can already say.
- Dashboards' panels, board column rules and automation rule conditions, which keep their own editors.
- The command palette's filter search, which keeps taking typed formulas.

ROADMAP: advances "Filters and views" (the feedback round of 2026-10-23); no new row.

No new environment variable, no op or sync change, no dependency. **Not breaking.**

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `filter-queries`: "Filter view" gains the builder, the two-way formula, the Builder toggle and the live count.
- `custom-views`: "Save and edit a view from the Filter view" lets a saved filter's query be edited with the same builder, still saved after confirmation.

## Impact

- `web/src/lib/filter/builder.ts` (new): the minimal-parentheses formatter, the tree ⇄ builder conversion and its limits. Pure, no React.
- `web/src/app/filter/` (new): `FilterBuilder.tsx`, `ConditionEditor.tsx`, `conditionText.ts` and stories.
- `web/src/app/FilterView.tsx`, `web/src/app/SavedViewView.tsx`: mount the builder over the formula field.
- Catalogs in the five shipped languages, `docs/filters.md`, `docs/saved-filters.md` if present, CHANGELOG.
- Bundle: the builder is a few hundred lines of app code with no dependency, loaded with the Filter and saved-filter screens. It adds about 6.5 KB gzipped to the main bundle; the design records the measurement and why it is not lazy-loaded.
