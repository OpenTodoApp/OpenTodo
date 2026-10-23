# Design

## Context

The filter grammar (`web/src/lib/filter/parse.ts`, documented in `docs/filters.md`, mirrored for validation by `internal/filter`) parses a formula into a tree:
- `or`, `and` and `not` nodes;
- leaves for labels, projects, priorities, date comparisons on five fields, state keywords, `search:`, `origin:`, tracked time, custom field comparisons and `no field`.

The Filter view (`FilterView.tsx`) and a saved filter (`SavedViewView.tsx`) each show one monospace input. A saved filter stores only `view.query`, the formula string, which the server validates with the Go parser and which `ot`, MCP and the assistants read.

## Goals and non-goals

Goals: show and edit any everyday query visually, keep the formula as the single stored form, and make the two views edit the same thing.

Non-goals:
- new grammar;
- natural-language input;
- replacing the board rule, automation and dashboard editors.

## Decisions

### D1. The formula stays the source of truth

The builder is a view of the parsed formula, not a second model that is saved.
- Every edit in the builder produces a new tree, prints it, and hands the text to the screen exactly as typing would.
- Every parseable change in the input re-derives the builder.

So:
- debouncing, history, saving, errors and warnings keep working unchanged;
- a saved view still stores one string, and sync, the server, the API and the CLI are untouched;
- two devices editing the same view converge as one field, last writer wins, as today.

Rejected alternative: storing a builder tree beside the query. It needs a schema, a migration path for older clients and a second source of truth.

### D2. A minimal-parentheses printer that round-trips

`printQuery` already prints a canonical, fully parenthesised form for tests. The builder needs readable text, so `formatQuery` prints with the precedence `!` > `&` > `|`:
- an `or` child of an `or` is parenthesised;
- an `or` or `and` child of an `and` is parenthesised;
- an `or` or `and` under `!` is parenthesised;
- nothing else is.

A same-kind child keeps its parentheses because the parser flattens `a & b & c` into one node but keeps `(a & b) & c` as two. Without them the reprinted text would parse to a different tree.

Leaves print as the parser reads them:
- label and project names are bare unless they contain a break character;
- custom field names are always quoted, because a bare one could be a reserved word;
- tracked minutes print as `45m`, `2h` or `1h30`.

Tests assert `parse(formatQuery(parse(q)))` equals `parse(q)` (ignoring source positions) for:
- every worked example in `docs/filters.md`;
- every edge form listed by the Go parser's acceptance test (`internal/filter/filter_test.go`);
- a few hundred generated trees covering every node kind, seeded so failures reproduce.

### D3. The builder model and its limits

The builder is a tree of groups and conditions:
- **A group** has an operator (`and` shown as "All of these", `or` as "Any of these"), a Not flag and its items.
- **A condition** is one leaf of the grammar plus a Not flag.

Converting from a parsed tree:
- The root is always a group. A single leaf becomes a root "All of these" with one condition, and `!(a | b)` becomes a root "Any of these" with Not set.
- `not` over a group or leaf sets that item's Not flag.
- `not` over `not` cannot be shown: the builder has one Not per item.
- Groups may nest three levels (the root and two below). Deeper nesting cannot be shown either.

A query the builder cannot show is never rewritten: the input keeps it, and the builder area shows a one-line notice ("This query uses more nesting than the builder shows. Edit it as text.").

Converting back:
- empty groups are dropped;
- a group with one item becomes that item, with the group's Not moved onto it;
- an empty root means an empty query.

So adding a group and leaving it empty changes nothing in the formula until a condition is added to it.

### D4. Editing a condition

A condition chip opens a dialog (the shared `Dialog`; a bottom sheet on phones):
- **"Filter on":** a select listing Label, Project, Priority, Due date, Deadline, Start date, Created, Completed, State (the keywords), Title or notes, Origin, Tracked time, and, when the account has custom fields, Custom field and Has no field.
- **Labels and projects:** a Combobox over the live labels or projects, with "include sub-projects" for a project, which gives `##`. A typed name that does not exist is allowed and produces the usual "No label named …" warning.
- **Dates:**
  - A comparison: before, on or before, on, on or after, after.
  - A value: today, tomorrow, yesterday, this, last or next week or month, a weekday, a number of days ahead or ago, or a specific date.
  - Completed is listed both as a state keyword and as a date field.
- **Priority:** four toggle buttons.
- **State:** the keywords with plain names, for example "Overdue", "Due today", "No date", "Blocked by another task".
- **Text, origin, tracked time and custom fields:** inputs, validated with the same parser before Save is enabled.

The dialog also holds the Not switch and a Remove action.

Rejected alternative: inline editing inside the chip. It is too cramped for date expressions and impossible at 360 px.

### D5. Placement, the toggle and the interface budget

The builder sits directly above the formula input, inside the same block as today's input. A **Builder** toggle button sits in the input's row, and the choice is kept in local storage per screen:
- `opentodo.filterBuilder.filter`, open by default;
- `opentodo.filterBuilder.view`, closed by default.

Interface budget (docs/interface-guide.md):
- With the builder closed, the chrome above the first result is unchanged: the header and the input row, 2 rows.
- In the Filter view the builder is open by default. That screen is an editor whose content is the query, and while the input is empty the builder replaces the usage hint rather than adding to it.
- On a saved filter it is closed by default, so the list starts where it did.
- No new shortcut is registered. The arrow and Delete keys work only inside the builder's own group, through roving focus.
- No new scroll region: the builder grows with its content.
- The 7-property limit on task rows is not touched.

### D6. The live count

The count sits at the builder's foot: "n tasks match".
- In the Filter view it is the result count already computed.
- On a saved filter with a changed, unconfirmed query, it compiles the draft with the same filter context (`runFilter`), so the person sees the effect before saving while the list still shows the saved query.

### D7. Chips read in words

`conditionText` turns a leaf into a short sentence through the i18n catalog: "Label is errand", "Project is Work (with sub-projects)", "Due before tomorrow", "Completed last week", "Tracked more than 1h", "Cost is greater than 100". A date comparison against a period reads naturally ("Due this week", "Completed last month"), as the grammar's `=` means "within".

## Data model

None. No new field, entity or op. `view.query` stays a string.

## Bundle and runtime

- No dependency.
- New app code: about 700 lines across the formatter, the builder and the condition dialog, plus catalog strings. It loads with the Filter and saved-filter screens, which are in the main bundle today. The measured main-bundle growth is recorded in "Implementation notes".
- No server change: binary and image size are unchanged, and runtime memory is unchanged.

## Risks

- **A parsed tree carries positions** (`pos`, `opPos`), so equality tests compare without them.
- **Drift between the TS printer and the Go parser:** the server validates a saved query with `internal/filter`, so every formula the builder writes must also pass there. The formatted forms of all round-trip fixtures are written to `internal/filter/testdata/formatted.txt`:
  - A vitest test fails if the file differs from what `formatQuery` prints, so it is regenerated with `UPDATE_FIXTURES=1`.
  - A Go test parses every line of it.
- **Long queries make a tall builder:** it can be hidden, and the formula stays one line.

## Implementation notes

(filled in while applying)
