# Proposal

## Why

In a long project or Inbox, quick add sits at the top of the page while a new task is appended at the bottom of the list. The user cannot see whether the task arrived, has to scroll down to fix a forgotten property, and back up to add the next one; once scrolled down, the Add row is out of sight and a mouse user has to scroll back up (issues #540 and #541, with screencasts). Todoist and TickTick both let people choose where new tasks go, and keep the add affordance reachable.

## What Changes

- **Add new tasks at the top or the bottom.** A synced account preference, "Add new tasks: At the bottom of the list (default) / At the top of the list", in Settings → Capture → Quick add. With "top", a task added from a list's quick add, a section's add row or a board column lands above the first task of that list, section or column; with "bottom" it is appended as today. A pasted block (`paste-to-tasks`) keeps its reading order either way. Lists sorted by something other than manual order (and Today, Upcoming, label and filter views) keep their sort; the preference only decides the position, which breaks ties there.
- **The quick add stays reachable.** On screens wider than a phone, a list's quick add sticks to the top of the list's scroll area while the list scrolls under it, so adding never needs a scroll back up. On phones the floating Add button already does this and nothing changes.
- **A task added out of sight is announced.** When a new task lands outside the visible part of the list (bottom of a long list), a toast says "Added to the bottom of Inbox" with Show, which scrolls to the task and selects it.

Out of scope: a per-project or per-section setting, an "add at top" key in the quick-add grammar, subtasks (the Add subtask field sits below the subtasks, so they keep appending), the CLI, the REST API and MCP (their creates keep appending unless the caller passes a `position`; the docs say so), and changing where the `o` "insert after the selected task" shortcut places a task (it keeps placing it after the anchor).

Advances ROADMAP-1.0 milestone 0.17 "Calm constraints", item `add-position`.

Fixes #540
Fixes #541

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `manual-ordering`: "Manual order by position" no longer says new items are always appended; a new requirement "Where new tasks are added" defines the preference and its effect.
- `task-list-presentation`: new requirements "Quick add stays reachable in long lists" and "A new task out of sight is announced".

## Impact

- **Data model and op schema:** one additive `user_prefs` field, `add_position` (string, `"bottom"` or `"top"`; empty or unknown reads as bottom), added to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` (generated op schema) and the defaults in `web/src/lib/ops.ts`. A setting, not content: not encrypted, no activity event. It syncs to the user's own devices and converges by last-writer-wins like the other `user_prefs` fields.
- **Sync:** a top insertion writes one `position` below the smallest position, in the same create batch; offline it works as any create, and concurrent top insertions on two devices converge through the id tie-break.
- **API, CLI, MCP, CalDAV, vault, importer:** unchanged behaviour (they append); documented.
- **Web:** `planTask`/`createTask` in `web/src/lib/ops.ts` take a placement; `TaskListView`, `Sections.tsx`, `BoardView.tsx`; sticky quick add CSS; the toast; Settings → Capture → Quick add card. Six languages.
- **Size:** no dependency; negligible client code. No new route.
