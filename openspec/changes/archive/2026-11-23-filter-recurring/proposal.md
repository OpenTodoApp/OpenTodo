# A `recurring` filter keyword

## Why

#1900 (kiwikern): a saved view of every repeating task across projects, for example to review chores, bills and renewals before going away. `habit` matches only tasks tracked as habits, and there was no term for an ordinary repeat rule.

## What Changes

- New keyword `recurring`: tasks with a repeat rule (`recurrence` set), habits and after-completion rules included. Occurrence records have no rule of their own and do not match.
- Both engines (`internal/filter`, `web/src/lib/filter`) and the shared vectors (`evaluate.vectors.json`).
- The filter editor names it "Repeats", a string that already exists in every locale.
- `docs/filters.md` lists it.

No new field, no new string, no op-log or API change, no new environment variable.
