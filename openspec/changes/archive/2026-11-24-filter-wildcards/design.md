# Design

## Context

Label, project and section terms resolve a name to the ids of every live item with that name key (`nameKey`: trimmed, lower case) in both evaluators. The tokenizer already lets `*` into a bare name, so `@home*` parses today and looks for a label literally named "home*".

## Decisions

### D1. One wildcard, `*`, in the three name terms

`*` matches any run of characters, none included, anywhere in the name and any number of times. It applies to `@`, `#`, `##` and `section:`, the terms the issue asks for. Other prefixed terms keep exact text: `workspace:` names few items, `assigned:` names people, `origin:` is a fixed vocabulary.

### D2. Matched by pieces, never as a regular expression

The pattern is split at its unescaped stars into lower-case pieces; a name key fits when it starts with the first piece, ends with the last, and holds the others in order between (leftmost search, which is exact for a star-only glob). No regular expression is built, so a name cannot inject one, and the cost is linear in the name per piece: the longest query (4096 characters) against a 10 000-character name runs in well under a millisecond. Each term resolves once per compile against the live names, so a task costs a set lookup, as before.

### D3. Escaping with `\*`

`\*` is a literal star. A bare name keeps its backslash as typed; a quoted name normally drops backslashes (`\"`, `\\`), and now keeps the one before `*`, so `@to\*do` and `@"to\*do"` mean the same. Other quoted text (`search:`, field values) is unchanged. The printers keep `\*` as one escape so a pattern round-trips. Pickers (the condition editor, the calendar's label checkboxes) escape the stars of the real name they insert, so picking "to*do" never widens into a pattern.

### D4. Hierarchy

`##pattern` takes every project that fits and adds the descendants of each; `#pattern` takes only those that fit. A section pattern still requires the section to be live and in the task's own project.

### D5. No match warns

A pattern that fits no live name warns with the existing message (`No label named "x*"`) and matches nothing, so no new string reaches the catalogs.

### D6. Rules

A rule's condition holds ids, which cannot follow future names, so "Make an automation rule" drops a wildcard term and names it, as it does for other terms a rule cannot hold.

## Alternatives rejected

- **Regular expressions** (`@/^home/`): powerful, but a user-supplied pattern risks catastrophic backtracking and differs between Go's RE2 and JavaScript.
- **Quoting as the escape** (a quoted name is always literal): `#"Client *"` would then be impossible, and project names often hold spaces.
- **A path syntax** (`#Work/*`): `##Work` already reaches sub-projects; slashes are legal in names.

## Impact

- **Data model:** none. A query is plain text; no op field, no migration.
- **Offline and convergence:** evaluated on the device from local data, offline included; a saved view converges as text like any other. The server accepts the same grammar when a view is saved and its evaluator (routines) lists the same tasks, checked by the shared vectors.
- **Size:** about 500 bytes of filter code; no dependency, no change to image size or memory.
- **Interface budget:** no screen gains anything. No new chrome, task property, sidebar destination, scroll region or shortcut.
