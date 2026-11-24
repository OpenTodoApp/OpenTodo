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

## Alternatives rejected

- **Match by section id.** Ids differ between users and devices, so a saved filter would hit one project's section only. The rules matcher uses ids because its picker is project-aware; a cross-project filter cannot.
- **`in: Review`.** Shorter, but diverges from the `label:`, `project:` and `assigned:` prefixes.
- **No `no section` keyword.** `!section: X` cannot express "no section at all" next to a named one.

## Impact

- **Data model:** none. A query is plain text; no op field, no migration. Sections reach both evaluators through contexts they already take (the calendar and palette filters now pass them too).
- **Offline and convergence:** evaluated on the device from local data, offline included; the server only validates the grammar when a view is saved.
- **Size:** a few hundred bytes of existing filter code and four strings per catalog; no dependency, no change to image size or memory.
- **Interface budget:** the Section condition is one more choice in the existing condition dialog. No new chrome, task property, sidebar destination, scroll region or shortcut.
