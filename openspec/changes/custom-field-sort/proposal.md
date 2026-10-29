# Sort task lists by custom fields

## Why

Issue #404: people can store a precise score such as WSJF, effort or cost in a custom number field and filter on it, but cannot put the highest-value task first. Built-in priority buckets are too coarse, and manual order does not rank a view spanning projects.

## What Changes

- Add **Number** and **Date** custom fields to **Order by** for project lists, label pages, saved views and the New view page. Keep each page's existing built-in options and defaults.
- Store a selected field sort in the existing `sort_by` string as `field:<name>`. Match field names without regard to case, so a saved view can sort tasks from different projects whose fields share a name.
- Sort numbers numerically and dates chronologically. Tasks without a matching value come last in either direction. Ties use the existing default order: due date, priority, manual position, then task id.
- Keep grouping, subtasks, Later and Completed behavior unchanged. Keep manual move behavior: a move in a project list switches back to manual order first.

Only Number and Date definitions are offered as sort choices. When another project defines a same-named Text field, its present values participate after Number values in both directions; missing values stay last. Text-only choices, Choice, Checkbox and Link sorting are out of scope.

This advances the Roadmap's section 3 item `custom-views` (saved views and display options) and the open request in issue #404.

## Compatibility

Not breaking: the existing `sort_by` values carry the selection; no operation field, migration or new endpoint is needed. The REST API accepts the additive `field:<name>` value for saved views. Older clients treat an unrecognized sort value as their existing default and leave it stored, so a newer client can resume the field sort.

## Out of scope

- Sorting by custom field values in boards, timelines, built-in views or the CLI.
- Offering Text-only, Choice, Checkbox or Link sort choices.
- Changing custom field definitions, task values or query behavior.

## Impact

- Web: sort option discovery, custom-field comparison and Display options for project lists, labels and saved views.
- API: saved-view `sort_by` validation accepts the field-sort form.
- Documentation: explain custom-field ordering in the project, label and saved-view guides, the API reference and the CLI guide.
- No data migration or new dependency.
