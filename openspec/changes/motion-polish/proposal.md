# Proposal

## Why

The interface audit (OpenSpec change `ux-audit-three-widths`) measures movement under reduced motion (M15) on completing a task, opening the task panel and opening a dialog; its first run found none, because motion-v2 already removes movement there. Motion elsewhere was not measured: the board's drag placeholder, the sidebar drawer, the command bar, sheets on a phone, toasts outside the list, the Plan and calendar drops. And the audit's final run found eighteen screens whose layout shifts after load (M12, `findings.md`): a page that jumps as its data arrives is motion the person did not ask for, and reduced motion cannot turn it off.

## What Changes

- M15 runs on every overlay of the inventory, at 1280 px with a mouse and at 360 px as a touch device, on completing a task in Today, and on a drag on the board, the Plan and the Week, watched from before the action until it settles (not one snapshot). Its result: nothing moves under reduced motion; the audit's strict mode now includes M15.
- M12 names the element that moved and by how much, not "page".
- Every M12 finding is fixed at its cause:
  - Lists, projects, the Plan, Statistics, Projects and Updates draw what depends on local data once it is read and show their skeleton until then (task-list-presentation "Skeleton loading" already asks for no layout jump), instead of an empty state or empty groups that fill in.
  - The phone bar's line under the title is one line of fixed height, so a lead line that arrives with the data (the Inbox's planned count, a project's members and Public chip) no longer grows the bar and pushes the page.
  - The sidebar's groups wait for the rows and the device's collapse state, so the project tree no longer opens and then folds.
  - A settings section draws its cards together once each has its first server answer (at most 600 ms), so a card that grows with its answer no longer pushes the cards below.
  - Smaller causes: the Display screen's footer, the project invite card, the Updates filters' widths, the Data page's sync line.
- M7 counts a transparent `::after` laid over a control as part of its hit area (the phone bar's subtitle controls keep 44 px that way).

Out of scope: motion that is already quiet; new animations; the remaining audit findings of other rules (`ux-fixes-phone`). ROADMAP: advances "Next: Design refresh"; no row is closed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: "Skeleton loading" covers every screen that reads local data, settings sections that ask the server, and the phone bar's subtitle.
- `web-app`: "Interface audit tour" watches movement on every overlay and three drags, and strict mode includes reduced-motion findings.
- `app-shell`: "Page template" fixes the phone bar's subtitle to one line.

## Impact

`scripts/ux-audit/` (tour, measurements, report, tests); `web/src/app` (Shell phone bar, TaskListView and its model, PlanView, StatsView, ProjectsView, FeedView, Sidebar, display screen, project invite screen, settings sections and the new `settingsPending.tsx`); `web/src/index.css` (`.phone-subtitle`); `web/src/lib/localData.ts` (two loading-aware hooks). No dependency; bundle grows by well under 1 KB.
