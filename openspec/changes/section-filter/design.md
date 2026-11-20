# Design

## Context

Both evaluators already receive the live sections (`available` reads them), and `label:` and `project:` already resolve a name to the ids that carry it. A section belongs to one project and its name is not unique.

## Decisions

### D1. Match by name, not by id

A saved filter travels between devices and people; ids do not. `section: Review` resolves to every live section named "Review" (ignoring case) in any project, the way `label:` does, so concurrent or per-project duplicates all match.

### D2. A task is in a section only as the lists show it

The task's `section_id` counts only while that section is live and in the task's own project (`effectiveSection`). A dangling, deleted or foreign reference is "no section". Both evaluators apply the same rule, so `no section` equals the lists' "No section".

### D3. Unknown name warns, matches nothing

As for labels and projects: `No section named "X"`, and the server still accepts the saved query.

### D4. Builder

One Section condition with the Combobox; choices are one per name, since the query cannot tell two same-named sections apart.
