# Design

## Context

Label, project and section terms resolve a name to the ids of every live item with that name key (`nameKey`: trimmed, lower case) in both evaluators. The tokenizer already lets `*` into a bare name, so `@home*` parses today and looks for a label literally named "home*".

## Decisions

### D1. One wildcard, `*`, in the three name terms

`*` matches any run of characters, none included, anywhere in the name and any number of times. It applies to `@`, `#`, `##` and `section:`, the terms the issue asks for. Other prefixed terms keep exact text: `workspace:` names few items, `assigned:` names people, `origin:` is a fixed vocabulary.

### D2. Matched by pieces, never as a regular expression

The pattern is split at its unescaped stars into lower-case pieces; a name key fits when it starts with the first piece, ends with the last, and holds the others in order between (leftmost search, which is exact for a star-only glob). No regular expression is built, so a name cannot inject one, and the cost is linear in the name per piece: the longest query (4096 characters) against a 10 000-character name runs in well under a millisecond. Each term resolves once per compile against the live names, so a task costs a set lookup, as before.

### D3. Escaping with `\*` and `\\`

In a name, `\*` is a literal star and `\\` a literal backslash; any other backslash is itself, so `@a\b` keeps meaning "a\b", and a trailing backslash is literal. Without `\\`, a backslash right before a wildcard could not be written: `@C:\\*` is every name starting with "C:\". A bare name keeps its backslashes as typed. A quoted name drops the backslash of `\"` (and of any other pair, as before), but now keeps `\*` and `\\` as escapes, so a bare and a quoted name read the same. Other quoted text (`search:`, field values) is unchanged. The printers keep both escapes and double a lone backslash, so every name round-trips. Pickers (the condition editor, the calendar's label checkboxes) escape the backslashes and stars of the real name they insert (`\` first, then `*`), so picking "to*do" or "a\b" never widens into a pattern; the shared literal vectors pin names with `\`, `\*`, a trailing `\` and `\\`.

### D4. Hierarchy

`##pattern` takes every project that fits and adds the descendants of each; `#pattern` takes only those that fit. A section pattern still requires the section to be live and in the task's own project.

### D5. No match warns

A pattern that fits no live name warns with the existing message (`No label named "x*"`) and matches nothing, so no new string reaches the catalogs.

### D6. Rules

A rule's condition holds ids, which cannot follow future names, so "Make an automation rule" drops a wildcard term and names it, as it does for other terms a rule cannot hold. A name that is exactly a live item's name (D7) still converts to that item.

### D7. The exact name wins

Before this change `@to*do` meant the label "to*do", and saved views, dashboards and routines hold such text. A term therefore first looks up its name exactly as written; only when no live item has that name is it read as a pattern (or, without a star, with its escapes resolved). `@to*do` stays the label "to*do" while it exists, and widens to "to-do" only once nothing is named "to*do". Both evaluators and the rule converter apply the same order, pinned by the shared vectors.

## Alternatives rejected

- **Regular expressions** (`@/^home/`): powerful, but a user-supplied pattern risks catastrophic backtracking and differs between Go's RE2 and JavaScript.
- **Quoting as the escape** (a quoted name is always literal): `#"Client *"` would then be impossible, and project names often hold spaces.
- **A path syntax** (`#Work/*`): `##Work` already reaches sub-projects; slashes are legal in names.

## Impact

- **Data model:** none. A query is plain text; no op field. No migration either: rewriting stored queries (`*` to `\*`) would be an op on every view, dashboard and routine of every account, would race edits made offline, and would turn queries typed as patterns after the release into literals. D7 keeps every saved query that named an existing item meaning that item, read at evaluation time on each device, so nothing stored changes.
- **Offline and convergence:** evaluated on the device from local data, offline included; a saved view converges as text like any other. The server accepts the same grammar when a view is saved and its evaluator (routines) lists the same tasks, checked by the shared vectors.
- **Size:** about 500 bytes of filter code; no dependency, no change to image size or memory.
- **Interface budget:** no screen gains anything. No new chrome, task property, sidebar destination, scroll region or shortcut.
