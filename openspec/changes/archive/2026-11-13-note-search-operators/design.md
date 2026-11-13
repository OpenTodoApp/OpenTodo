# Design

## Context

`parseQuery` (TypeScript) and `ParseQuery` (Go) turn a query into a list of normalised terms: quoted text is one phrase, the rest one term per word. Every term must occur in the prepared note (title and stripped text joined). Ranking puts title matches first, then the number of matched terms, then the last change. The two implementations are pinned by `internal/notesearch/testdata/vectors.json` (`docs/contracts.md`). The Notes page adds tokens on top (`notes-space`): `in:`, `@`, `kind:`, `linked:`, `orphan`, `pinned`, `changed:`; they filter the notes before the words match and never reach `noteSearch`.

## Goals / Non-Goals

Goals: either-of words, title-only and text-only words, a date range; one grammar everywhere notes are searched; no change for queries without operators.

Non-goals: a boolean language with parentheses or `NOT`, wildcards, fuzzy matching, server-side search of encrypted text.

## Decisions

### D1. A query is an AND of OR-groups

The parsed query becomes a list of groups; a group is a list of alternatives; an alternative is a term (word or phrase) with a field (`any`, `title`, `text`). Words separated by the literal token `OR` (capitals, standing alone, outside quotes) join one group; every other space starts a new group. A note matches when every group has at least one alternative that occurs in its field. `OR` at the start or the end, or doubled, is ignored (`OR ferry` = `ferry`). A query without `OR` gives one alternative per group, which is exactly today's list of terms, so every existing vector keeps its answer.

Alternatives considered:
- **Lower-case `or` as the operator.** Rejected: "or" is a word people search for (in Italian notes "or" is common enough, and "Oregon" starts with it in a word list); capitals make the intent explicit, as in most search engines.
- **Parentheses.** Rejected: rare in note search, and a parser with precedence is more than the field needs.

### D2. `title:` and `text:` prefixes

A word or phrase directly after `title:` or `text:` (no space) is limited to that field: the title, or the stripped text. Matching is the same normalised substring test as today, against that field alone. A prefix without a value is a word. `title:` and `text:` are not Notes page tokens: they stay in the words, so they work in the CLI and MCP, and they do not become chips. On the Notes page, the key suggestion of `notes-space` offers `title:` and `text:` after two letters like the other keys, and Tab completes them.

Ranking: a group counts as a title match when its matched alternative matched in the title (a `text:` alternative never does). Snippets and highlights use the matched alternatives; a `title:` term is not highlighted in the snippet.

### D3. `changed:` range is a token

`changed:YYYY-MM-DD..YYYY-MM-DD` joins the `changed:` forms of `notes-space`: notes whose last change falls on a day from the first to the second date, both included, in the viewer's time zone. A reversed range is read in order. An open end (`2026-10-01..`, `..2026-10-31`) is the same as `>`/`<` with that day included. The date suggestions offer "This month" and "Last month" as ranges. It is client-only like every token; the CLI and MCP get no date option from this change.

### D4. One grammar, two implementations, shared vectors

`internal/notesearch.ParseQuery` and `noteSearch.parseQuery` return the same groups for every vector. New vector cases: OR inside a group, OR with a phrase, OR at the edges, lower-case `or`, `title:` and `text:` with words and phrases, a prefix without a value, ranking with a `text:` match, highlight of field-limited terms. MCP `search_notes`, `ot notes search` and the routine Find notes step pass the query through unchanged.

## Data model

None. No op field, no stored value; the chips of `changed:` ranges are stored on the device like the other chips.

## Size and memory

A few hundred bytes of parsing in the lazy Notes chunk and in the shared `noteSearch` module; matching stays linear in the notes and terms; the 10,000-task budgets of `performance-budgets` are unchanged.

## Interface budget

No new control or row: the operators are typed in the existing search field, the range is one more chip. Chrome above the first row stays the header and the search field. No new shortcut.

## Risks / Trade-offs

- People type `OR` meaning the word (an acronym): they can quote it (`"OR"`).
- Adding fields to the parsed query changes the Go and TypeScript function shapes; the callers are few (`internal/agenttools`, `internal/cli`, the Notes page, the palette) and covered by tests.
