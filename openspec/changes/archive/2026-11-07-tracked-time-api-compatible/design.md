## Context

`fix-recurring-tracked-time` gave every reader of a task's tracked total the current-occurrence figure (`currentTotals` / `CurrentTotals`). `docs/stability.md` covers the MCP tools' result fields, and saved views and routines are stored user programs whose results must not change within 1.x. The display in the app is not covered and is the fix #1004 asked for.

## Decisions

### D1. Two figures, named apart
Every reader computes both from the same entries: the total (`totalsByTask` / `TotalsByTask` without `since`, the 1.0 figure) and the current occurrence (`currentTotals` / `CurrentTotals`). The 1.0 names keep the 1.0 figure: `tracked_minutes`, the condition `tracked`, the filter terms `tracked`. The new figure gets new names: `tracked_minutes_occurrence`, `tracked occurrence`. The app's row chip and Time tab read the occurrence. The shared fixture `occurrence_fixture.json` already pins both (`totals`, `all_totals`), and gains the 30-before, 10-after case.

### D2. `tracked occurrence` in the filter grammar
`tracked` is already a reserved word followed by an optional comparison. `occurrence` after it is an optional word, like `no date`: `tracked occurrence` (at least one minute) and `tracked occurrence > 1h`. In 1.0 `tracked occurrence` is a syntax error (`Expected "&" or "|" before "occurrence"`), so no stored query changes meaning, and `occurrence` stays usable as a custom field name. On a task that does not repeat both forms read the same minutes. A context without the occurrence map (an older caller) reads the total. The condition editor's tracked time condition gets an **All occurrences** switch, on by default; turning it off writes `tracked occurrence`. The filter context carries both maps (`tracked`, `trackedOccurrence`; Go `Tracked`, `TrackedOccurrence`), which the app's shared totals store holds side by side.

### D3. No per-occurrence routine condition
A routine's conditions run on its trigger's task. The commonest trigger for a repeating task is `task.completed`, and completing it is exactly what starts a new occurrence, so a per-occurrence condition would read 0 there every time. A routine that needs the figure can use a Find tasks step with `tracked occurrence`. The condition `tracked` and its shared vectors (`web/src/lib/rules/match.vectors.json`) stay as they are, reading every entry.

### D4. `tracked_minutes_occurrence` only on repeating tasks
The field is set on a task with a rule (`recurrence`), 0 when nothing was tracked in the current occurrence, and left out for other tasks, where it would equal `tracked_minutes`. It is additive under `docs/stability.md`. REST task rows carry no tracked total, so no REST response changes; `docs/api.md` points to the MCP fields.

## Risks / Trade-offs

- A routine or saved view written after #1008 and before this change, expecting the occurrence figure, reads the total again; it can use `tracked occurrence`. #1008 shipped in no release, so no released client depends on it.
- Data model: none. No op, field or schema change; no dependency. Bundle: a few lines in the filter and the totals store and two strings.
- Screens: one switch inside the existing tracked time condition dialog, no new chrome, task property, sidebar destination, scroll region or shortcut, so the interface budget of docs/interface-guide.md is unchanged.
