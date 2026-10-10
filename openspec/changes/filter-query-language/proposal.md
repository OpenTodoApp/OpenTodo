# Proposal

## Why

The built-in views (Inbox, Today, Upcoming, project, label) answer fixed questions. Real planning needs ad-hoc ones: "work tasks due by tomorrow that are high priority", "anything overdue without a project", "errands I can do in 15 minutes this week". A small, documented query language lets the user express these in one line, and gives `custom-views` something to save and pin. Because the client holds all data locally, queries run entirely on the device: they work offline, cost nothing on the server, and need no new API.

## What Changes

- A filter query language with terms for labels (`@errand`), projects (`#Work`, `##Work` including sub-projects), priority (`p1`–`p4`), dates (`due <= tomorrow`, `due before 2026-12-01`, `created > 7 days ago`), keywords (`overdue`, `today`, `no date`, `no project`, `no labels`, `completed`, `subtask`), and text search (`search: milk`), combined with `&`, `|`, `!` and parentheses.
- A documented grammar (`docs/filters.md`) with precedence, quoting rules for names containing spaces, date expressions and the list of keywords.
- Evaluation entirely client-side over local data: results are live, offline, scoped to open non-deleted tasks unless the query says otherwise.
- Error handling: syntax errors report the position and what was expected; names that match no label or project are warnings that evaluate to no match rather than errors, so queries survive renames and deletions gracefully.
- A Filter view (`g f`) with a query input, inline error or warning, live results grouped by project, and a per-device history of recent queries.

Out of scope: saving, naming and pinning queries (`custom-views`), natural-language date parsing beyond the fixed date expressions listed in the grammar (`nlp-quick-add`), server-side evaluation or a query parameter on the REST API, full-text ranking or stemming (search is case-insensitive substring over title and description), assignee or collaborator terms (`task-assignment`), duration terms (`time-blocking`).

This change advances ROADMAP.md section 3, "Filter query language (`@work & due <= tomorrow & p1`)".

No new environment variables. No change to the op log: the language reads data and writes nothing.

## Capabilities

### New Capabilities
- `filter-queries`: the grammar, term semantics for labels, projects, priority, dates, keywords and search, client-side evaluation, error and warning behavior, and the Filter view.

### Modified Capabilities
- none. `web-app` keyboard navigation gains `g f` as an additive shortcut described in the new capability.

## Impact

- Client only: a tokenizer, a recursive-descent parser producing a small AST, an evaluator over local tasks, the Filter view and query history in the local `meta` table. Labels and project hierarchy terms degrade gracefully if `labels` or `project-hierarchy` have not shipped (label terms warn "no labels yet", `##` behaves like `#`).
- Docs: new `docs/filters.md`; README feature list; `?` help.
- No new dependencies; bundle growth expected around 6 KB gzipped for parser, evaluator and view.
