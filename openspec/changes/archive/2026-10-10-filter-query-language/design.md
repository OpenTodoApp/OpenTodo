# Design

## Context

All of the user's data is already in the browser, so a query language is a pure client feature: parse a string, evaluate a predicate over local tasks, render with the existing list components. The design choices are about the grammar's shape (small, unambiguous, documentable), how it degrades when names change, and keeping it cheap enough for a phone.

## Goals / Non-Goals

**Goals:**
- A grammar small enough to fit on one documentation page and be learned in minutes.
- Deterministic parsing with helpful error positions.
- Evaluation that is offline, live and fast on a few thousand tasks.
- An AST that `custom-views` can store (as the query string) and that later changes can extend with new terms without breaking old queries.

**Non-Goals:**
- Server-side queries or a REST query parameter.
- Natural-language dates beyond the fixed expression set.
- Ranking, fuzzy search, stemming.

## Decisions

### D1. Grammar
```
query    := or
or       := and ( "|" and )*
and      := not ( "&" not )*
not      := "!" not | "(" or ")" | term
term     := "@" name            label
          | "##" name | "#" name project (with / without descendants)
          | "p1".."p4"
          | ("due" | "created") cmp date
          | keyword
          | "search:" text
cmp      := "<" | "<=" | "=" | ">=" | ">" | "before" | "after"
date     := "today" | "tomorrow" | "yesterday" | weekday | YYYY-MM-DD
          | INT "days" | INT "days ago"
keyword  := "overdue" | "today" | "tomorrow" | "no date" | "no project"
          | "no labels" | "no time" | "completed" | "open" | "subtask"
name     := word | '"' chars '"'
text     := word | '"' chars '"'
```
Case-insensitive keywords and names. `&` and `|` are the only connectives (no implicit and, no comma alias) so that an unquoted name can contain any character except whitespace, quotes and the operator characters. Precedence `!` > `&` > `|` matches boolean convention.
- Alternative: comma as "or" and whitespace as "and". Rejected: ambiguous with multi-word names and `no date`.

### D2. Hand-written tokenizer and recursive-descent parser
About 250 lines of TypeScript, no parser generator or library. Errors carry a position and an "expected" set, rendered as `Expected a term after "&" at position 9`. The AST is a plain discriminated union, serialisable, and `custom-views` stores the source string rather than the AST so future grammar extensions re-parse old queries.

### D3. Name resolution at evaluation time, warnings not errors
`@name`/`#name` are resolved against current labels and projects every evaluation (cheap maps), so a rename is picked up automatically and a deleted name degrades to a warning plus empty match. This keeps saved queries from breaking later and is the main reason unknown names are not syntax errors. Several entities with the same name match any (duplicates exist legitimately under concurrent creation).

### D4. Evaluation strategy
Compile the AST once per query to a predicate `(task, ctx) => boolean` where `ctx` holds today's date, label/project maps and the project descendant sets. Run over all non-deleted tasks from the local store (the same live query the other views use), then group and sort with the shared helpers. For a few thousand tasks this is well under a frame; typing is debounced by 150 ms. If volumes grow, the first term can pre-filter by an index (`project_id`, `completed_at`) without changing semantics.

### D5. Defaults and dates
Open tasks unless `completed` appears (`completed` alone means only completed; `completed | open` both). Dates compare floating calendar dates in the viewer's zone, consistent with Today/Upcoming. "Today" is re-evaluated when the date rolls over while the view is open (existing midnight tick).

### D6. Graceful dependence on other changes
`@` terms warn "no labels yet" if the `labels` entity is absent; `##` equals `#` without `project-hierarchy`; `subtask` is false without `subtask-trees`. The grammar is fixed now so documentation and saved queries stay stable.

## Data model impact
- None: no entities, fields or ops. Query history lives in the local `meta` table per device and is not synced.
- Dependencies: none. Container image and runtime memory unchanged. Client bundle +5–7 KB gzipped (tokenizer, parser, evaluator, view).

## Risks / Trade-offs

- [Grammar too small for some wishes (durations, assignees)] → terms are additive; the parser rejects unknown words with a clear message, and later changes add terms without breaking old queries.
- [Full scan per keystroke on large data] → debounce, compiled predicate, optional index pre-filter.
- [Ambiguity between keyword `today` and date `today`] → `today` alone is the keyword (due today), `due = today` is the comparison; both documented with examples.
- [Locale weekday names] → English keywords only in this change; a localisation change can add aliases.

## Migration Plan
None. Purely additive client behavior.

## Open Questions
- Whether `search:` should also match label and project names; deferred until feedback.
