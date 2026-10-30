# Design

## Context

`planTask` in `web/src/lib/ops.ts` gives every new task `nextTaskPosition(now)`: the creation time, or just past the largest position in the table, so new tasks append everywhere. Lists in manual order (projects, sections, board columns, the Inbox; `manual-ordering` "Which views are manually ordered") sort by `position` ascending with an id tie-break; other views sort by their own rule and use position to break ties. The list page (`TaskListView`) puts its quick add right under the page header; `SectionQuickAdd` opens under a section header or at a board column's foot. The server's REST create sets `position` to the current time when the body has none. The page header is already sticky inside the content scroll area (`Shell.tsx`), and phones have a floating Add button that opens the add sheet.

## Goals / Non-Goals

**Goals:** a person who adds many tasks to a long list sees each one arrive and never scrolls to reach the add field.

**Non-Goals:** per-list placement, placement for API, CLI or MCP creates, any change to how moves work.

## Decisions

### D1: One synced account preference

`user_prefs.add_position` (`"bottom"` | `"top"`, read as bottom when empty or unknown; the stored value is kept). Synced rather than per device because it is about how the person works, like `row_layout`, and the issue asks for one setting. It lives in Settings → Capture → Quick add as a two-option choice card "Add new tasks" (At the bottom of the list / At the top of the list), with one line of help: "Lists sorted by date or priority keep their order." Not a property of the project: a per-project choice would be a second place to look for one habit.

*Alternative:* per device (localStorage, like the quick-add parsing switch): rejected, the person would set it on every device and phone and desktop would disagree.

### D2: Top means below the smallest position

With "top", `planTask` takes `placement: 'top'` and computes `min(position) − GAP` from one indexed read (`db.tasks.orderBy('position').first()`), mirroring `nextTaskPosition`; several tasks planned in one batch get a block of increasing positions ending at `min − GAP`, so a pasted block reads in order at the top. Using the global minimum rather than the target list's minimum is one read instead of a scan, and it is below every task of every list, so the task is first in whichever manual list it lands in (project, section, column or Inbox). Positions are numbers, so drifting below zero is harmless; renumbering (`manual-ordering`) is untouched.

*Alternative:* insert at the list's own first position minus GAP: needs the list's rows (section, parent, project) at plan time; no visible difference.

### D3: Which adds follow it

Followed by: the list page's quick add in a project or the Inbox, a section's add row in a list, a board column's add row, and the command bar or phone sheet when the task lands in a manual list. Not followed by: Add subtask (its field is below the subtasks; subtasks keep appending), the `o` insert-after-selected shortcut (keeps its anchor), duplicates and templates (keep their source order), imports, and anything written by the server. In date and filter views the position still follows the preference but is only a tie-break, so Today shows no difference.

### D4: Sticky quick add above phone width

From 768 px wide, wherever the floating Add button is not shown, the list page's quick add wrapper becomes `position: sticky` directly under the sticky page header, on the page surface with its bottom border, so rows scroll under it. It is the same row, so the "two rows of chrome above the first item" budget holds; the open selection bar keeps its own place and is never covered. Section add rows and board columns do not stick (they open on demand where the user clicked). Below 768 px nothing changes: the floating Add button is always reachable, and a sticky field would cost a phone's vertical space.

### D5: Out-of-sight announcement

After an add from a list page or a section, if the new row is not inside the visible part of the scroll area, a toast says "Added to the bottom of {list}" (or "…the top of…" when the list is scrolled away from the top) with Show, which scrolls the row into view and selects it. No toast when the row is visible. The Inbox's existing "Added to Today/Upcoming…" note (inbox-means-unplaced) wins when the task left the Inbox.

## Data model, size and budget

One additive `user_prefs` string field (`add_position`) in `internal/sync/ops.go`, `web/src/lib/types.ts` and the `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`; the server only checks the kind. Not content, not encrypted, no activity event. No dependency; no effect on image size or memory. Interface budget: no new row (D4 reuses the quick add row), no task property, no sidebar destination, no scroll region, no shortcut. Progressive disclosure: the default is today's behaviour, so nobody sees a difference until they change the setting; the sticky field is a visible improvement for everyone above phone width.

## Risks / Trade-offs

- [Two devices add at the top offline and pick the same position] → the id tie-break gives one order on every device; both tasks are at the top.
- [A sticky quick add covers a focused row] → rows get a scroll padding equal to the sticky area, like the sticky header (WCAG 2.2 2.4.11 is already asserted for row actions); a test checks a focused row is not obscured. *As built:* the keyboard cursor's row is kept below every pinned element by `revealRow`; a scroll padding on the scroller was dropped because Chrome then treats the stuck field itself as covered and scrolls the list back up whenever the field takes focus.
- [API users expect "top" too] → documented in `docs/api.md`: pass a `position` smaller than the list's first; a server-side preference can follow later without changing this design.
