# Design: sort task lists by custom fields

## Context

Project lists, label pages and saved views already persist their order in a string `sort_by` value. Each page gets its Order by choices from the shared list display panel. Custom fields are project-scoped; task values are keyed by definition id, and definitions may be inherited from ancestor projects. Field queries already match names without regard to case across projects. Saved views may contain tasks from several projects.

## Decisions

- **D1 Reuse the existing sort value.** Store a field sort as `field:<name>` in the existing project preference, label or view `sort_by` string. Use the field name rather than a definition id because a label or saved view can contain tasks from separate projects with distinct definitions named `WSJF`. The name is matched using the same case-insensitive semantics as custom-field query terms. No operation schema field or database migration is introduced. The view REST API accepts a non-empty name after `field:`; it does not require the field to exist at write time, since a saved view can be edited while offline or before its matching project is available.
- **D2 Resolve each task's applicable definition.** Build the options from live Number and Date custom-field definitions applicable to tasks in the displayed list, including inherited definitions. Show each case-insensitive field name once. Resolve a task's matching definition using the existing applicable-field order (ancestors farthest first, then each project's fields by position, then the task's project). A task from a project with no matching definition, or with no value, sorts as missing.
- **D3 Sort by typed values, including across types.** Compare Number values numerically and Date values chronologically as their `YYYY-MM-DD` dates. Same-named Text definitions participate with lowercased Unicode code-unit comparison, independent of browser collation; equal values use the existing fallback. If matching definitions have different types across tasks in the same list, dates sort before numbers, followed by text, in ascending order; descending reverses both the value and type order. Reverse only the primary comparison, not the fallback. Missing or type-mismatched values always come after present values in both directions. Field-name comparison and option de-duplication use the same case-insensitive matching as field query terms.
- **D4 Keep current tie and list behavior.** When two tasks have equal field values, use the existing fallback order: due date, priority, position and id. In saved views, the chosen order remains within each existing group. In project lists, section headers, parent/subtask nesting, Later and Completed keep their current behavior. A project drag or keyboard move while a field order is active first switches the project back to Manual order, as it does for other non-manual sorts.
- **D5 Unknown values remain forward-compatible.** A client that does not recognize `field:<name>`, including an older client, reads the list with the existing default order and does not rewrite the stored value. If no matching field definition is currently available, the new client also uses the default until the definition is available. Renaming or deleting the field therefore leaves an unresolved name sort stored; it can become active again if a matching field name is available later. This follows the existing unknown-sort behavior and avoids writing to preferences as a side effect of field edits.
- **D6 Keep built-in defaults.** Existing built-in options, initial sort values, sort direction, per-project/per-label/view persistence and sync behavior stay unchanged. Field options appear after the built-in options.

## Risks and tradeoffs

- A saved `field:<name>` order follows the name, not one definition id. Renaming the only matching definition makes the value temporarily unknown; the list shows its existing default and retains the saved string.
- A same-named field can be Number in one project and Date in another. For a list spanning both, Date values sort before Number values, then Text values ascending; descending reverses that order. This deterministic rule is simple to preserve across devices, although users may prefer to keep same-named fields at the same type.
- Old clients do not perform the custom-field sort, but preserve the sort value for clients that support it.

## Verification direction

Cover numeric ordering (including values such as 2 and 10), date ordering, ascending and descending, mixed date/number/text definitions, missing values in both directions, case-insensitive cross-project definitions, tie fallback, inherited definitions, unknown values on older-client paths, existing groups and nested subtasks, and Later/Completed placement. Verify the same sort choice in project, label, saved-view and New view lists, and verify REST acceptance of `field:<name>`.

The option reuses the existing Display options panel, adding no chrome or task properties, so it stays within the interface budget. It remains keyboard-operable through the existing Order by select.
