# Order a list by urgency

## Why

People with more tasks than time need one answer from a long list: what to do first. Priority alone is too coarse (four buckets), due date ignores priority, and neither knows that a task blocks three others or has been waiting for two months. The research names Taskwarrior's deterministic urgency score as the reason it stays the CLI favourite: one number per task from due proximity, priority, blocking, age and blocked status, with weights the user can read (research.txt, §1 and roadmap phase item 4, "a Taskwarrior-style deterministic Urgency Score sort option calculated locally on the device … with a hover breakdown tooltip"). OpenTodo already holds every input (due, deadline, priority, `blocked_by`, start, created, running time entries), so the score is a derived sort with no new data.

Issue #404 asks for the neighbouring need, ordering by a number the user computes elsewhere (WSJF in a Number custom field). A contributor's change `custom-field-sort` (PR #549) delivers that and closes #404. This change does not repeat it: it adds one more order next to it.

## What Changes

- A new order, **Urgency**, in **Display options → Order by** on project lists, label pages, saved views and the New view page, after the built-in orders and before the custom fields of `custom-field-sort`. It orders highest urgency first; the direction under **More options** still works (ascending puts the least urgent first).
- The score is derived, never stored: a fixed sum of seven components (due, deadline, priority, blocks others, age, running timer, and the negative blocked, deferred and Someday terms), computed on the device from local data with the viewer's logical today. The weights are fixed in this version and documented.
- While a list is ordered by urgency, each row shows its score as a small faint number in the row's trailing group; hovering or focusing it shows the breakdown ("Due today +8.80 · Priority 1 +6.00 · Blocks 2 tasks +8.00 · Age 30 d +0.16 = 22.96"). On a phone the row's touch menu has "Why here?" with the same breakdown in a sheet. No other list shows the number.
- The same score in Go (`internal/urgency`) and TypeScript (`web/src/lib/urgency.ts`), pinned by shared vectors, so the MCP `list_tasks` tool (`sort: "urgency"`) and the CLI (`ot list --sort urgency`) order the same way as the web app.
- The stored value is one more additive `sort_by` string, `urgency`, on views (`view.sort_by`), project preferences (`project_prefs.sort_by`) and labels; `/api/v1/views` accepts it.

Not **BREAKING**: no new op field, no new route, no new environment variable. `sort_by` is already a free string in the op schema; older clients read `urgency` as their default order and leave the value unchanged (`list-display-options` "Unknown value").

**Depends on** `custom-field-sort` (#549) landing and being archived first. It reuses that change's sort-value parse and build helpers (`field:<name>` beside plain values), its rule that tasks without a value come last, and its tie chain (due date, priority, position, id). If #549 has not landed when this is implemented, this change waits for it rather than duplicating those helpers. The roadmap's "Also sort by custom field" for this item is delivered by #549, not here.

Out of scope:
- User-tunable weights, per-project weights or a weights preference (a later change if asked; the fixed table keeps the score explainable and identical on every device).
- Feeding a custom Number field into the score. That would be a formula field, which the roadmap rules out; a WSJF or RICE user keeps their own score in a Number field and orders by it with `custom-field-sort`.
- Grouping by urgency bands, an urgency filter term (`urgency > 10`), and urgency on Today, Upcoming, the Board or the calendar.
- The 2x2 matrix layout (superseded by the Eisenhower board template).

ROADMAP: 0.18 "The mindful daily planner", item `urgency-sort`.

Relates to #404

## Capabilities

### New Capabilities

- `urgency-score`: the derived score, its components and weights, the shared vectors, and its use by the MCP tools and the CLI.

### Modified Capabilities

- `list-display-options`: an ADDED requirement for the Urgency order and the score chip on project and label pages. The requirements `custom-field-sort` modifies are not touched.
- `custom-views`: an ADDED requirement for the Urgency order in saved views, the New view page and `/api/v1/views`. The requirements `custom-field-sort` modifies are not touched.

## Impact

- Data model and sync: none. `sort_by` values stay strings; no migration.
- E2EE: none. The score reads no content field (titles and notes are never inputs), so it is identical on encrypted accounts, locked or unlocked.
- Server: new package `internal/urgency` (pure, standard library); `internal/httpapi/views.go` adds `urgency` to `viewSortBy`; `internal/agenttools/read.go` `list_tasks` gains a `sort` argument (`default` | `urgency`), each result then carrying `urgency` and its breakdown; `internal/cli` `ot list --sort urgency`.
- Web: `web/src/lib/urgency.ts`, `web/src/lib/urgency.vectors.json`, the sort comparator in `web/src/lib/listDisplay.ts` / `listGroups.ts`, the Order by choices in `web/src/app/views/DisplayPanel.tsx`, the score chip in `TaskRow`'s trailing group, the touch row menu item.
- Docs: `docs/group-and-order.md` (the order and the weight table), `docs/api.md`, `docs/cli.md`, `docs/mcp.md` (or the MCP section of `docs/api.md`); CHANGELOG.
- Size: about 2 KB minified to the web bundle (the function and the breakdown popover); a few KB to the binary. No dependency.
