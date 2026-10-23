## Why

The Precision redesign (round 2, change 4 of 13) opens a task as a full page, not in a side panel: the owner found that a page with a breadcrumb, "4 / 12" and keys to step and go back keeps the flow better than a panel that squeezes the list, and the design decided that nothing docks beside a list except the Inbox's triage. The panel's facet lines also hide unset properties behind an Add menu, which the mock-up replaces with a facts column where an unset fact is its own quiet action.

## What Changes

- A task opens as its page at `/task/<id>` from every list, the palette, reminders and notifications. The page remembers the list it came from: "n / m", `j` / `k` and the arrow controls step through it, and Esc, Close or the phone's Back return to the same list with the task selected and the scroll restored.
- The page has a compact header (breadcrumb, place in the list, menu, Close) and two columns: content (title, notes never clamped, subtasks as one block with progress, attachments, the conversation with the composer pinned at the bottom) and facts (Schedule, Details, Labels, Project) that sit under the notes below 1024 px.
- Facts are labelled rows; an unset one reads as its action ("Set a deadline", "Add a place") and opens the same popover editor the facet parts open, writing the same operation.
- One composer frame (`ComposerFrame`, field + tools + round Send) used by the comment composer and meant for the assistant composer (change 10, assistant-surface).
- The side panel is retired for tasks: the slot keeps project activity, history and the planning list, and docks a task only on a page that asks for a split (Process the Inbox now; the Inbox list in change 7, inbox-split) from 1024 px. The phone task sheet is removed; phones open the page.
- `?task=<id>` addresses keep working and open the page. Copy link copies `/task/<id>`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: opening a task, the page layout, the composer's place; new requirements for the task page's navigation and the facts column.
- `app-shell`: the panel slot hosts tasks only on split pages; panel width without the phone sheet; the tab bar hides on the task page.
- `comments`: the composer sits in the shared frame with a round Send control.
- `task-management`, `rich-text-editing`: fields and notes are edited on the task page.
- `design-system`: the interface budget counts the facts column as groups of rows.

## Impact

- Web only: `web/src/app/taskTrail.ts` (new), `TaskPage.tsx`, `panel.ts`, `Shell.tsx`, `signals.ts`, `NotificationBell.tsx`, `TriageView.tsx`; `task-detail/` gains `TaskPageView`, `TaskFacts`, `TaskHead`, `TaskNotes`, `Subtasks`, `TaskActionsMenu`, `useTaskDetail` and loses `TaskSheet`; `ui/patterns/ComposerFrame.tsx`; three view-scope shortcuts (`task.next`, `task.prev`, `task.escape`).
- No server, sync, op or API change; no new dependency. Bundle: about the same (the sheet's code goes, the facts and trail come in).
- E2E and screenshot scripts select `[data-detail-for]` instead of `aside[data-detail-for]`; visual baselines move for the task stories.
