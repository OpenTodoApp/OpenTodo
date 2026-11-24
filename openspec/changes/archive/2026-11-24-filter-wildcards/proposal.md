# Proposal

## Why

People name projects, sections and labels by convention (`backlog-quick`, `backlog-delayed`, `project-x`), and want one view for all of them. The filter language names each one exactly, so a saved view misses every new item that follows the convention until someone edits it by hand.

## What Changes

- **`*` in a label, project or section name matches any run of characters**, none included: `@home*`, `#*client*`, `##backlog*`, `section: "In *"`. Matching ignores case, as names already do. The names are looked up every time the query runs, so a new item that fits is picked up at once.
- **`##pattern`** adds the sub-projects of every project that fits; `#pattern` only the projects that fit.
- **`\*` is a literal star and `\\` a literal backslash**, in a bare or a quoted name, so a label actually named "to*do" is `@to\*do` and `@C:\\*` is every name starting with "C:\". The builder and the label checkboxes write a picked name that way.
- **The exact name wins:** a name that is exactly a live item's name means that item, so a saved `@to*do` stays the label "to*do".
- A pattern that fits no live name warns and matches nothing, like an unknown name.
- "Make an automation rule" leaves a wildcard term out (a rule holds ids), naming it as not carried over.

No schema or op change: a query is plain text. Nothing is **BREAKING**: a saved query that named an existing item still means it (the exact name wins); only a name with `*` or `\\` that matched nothing before now reads as a pattern or an escape.

Out of scope: wildcards in `workspace:`, `assigned:`, `origin:` and field names, `?` or character classes, regular expressions, path terms such as `#Work/Sub`, and autocomplete of patterns (the filter input completes field names and origins only; neither is a name term).

Advances the ROADMAP capability "Filter query language" (section 3, Organisation, views and GTD); closes [#1967](https://github.com/OpenTodoApp/OpenTodo/issues/1967).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `filter-queries`: adds wildcard names.

## Impact

`web/src/lib/filter/` (tokenizer, printers, a new `names.ts` matcher), `internal/filter/` (tokenizer, a new `names.go`), the condition editor and the label checkboxes (a picked name is written literally), `web/src/lib/rules/convert.ts`, `docs/filters.md`, the shared evaluation vectors and a shared matcher fixture. No new translated string. Bundle impact is a few hundred bytes.
