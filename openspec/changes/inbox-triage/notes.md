# Implementation notes

## Status (2026-10-15)

Done on `feat/inbox-triage`: 1.1 `web/src/lib/triage.ts` (queue, progress, announcements) with tests for the spec scenarios. Everything else is screens, shortcuts, docs and smoke tests, held until the ux-overhaul PRs (through its group 4, which re-cuts the sidebar and router) merge.

## Decisions taken while implementing

- The queue state also has `advance` and `back` helpers, so the view and the Vim layer share one definition of what a decision and `k` do.
- Outcome dates are passed in already formatted, so the module stays free of the user's date preferences.

## Screens (2026-10-16)

- `TriageView` at `/triage` (`g` `p`, the Inbox header's **Process** button, `:triage`). It has the card, the live region, and a decision bar with key hints. Each decision goes through the Undo helpers (`completeWithUndo`, `setDueWithUndo`, `moveWithUndo`, `deleteWithUndo`, `parkWithUndo`), so 5.2's "Undo toast" comes from ux-overhaul's single-action undo. Delegate uses `moveTaskAcrossScopes(id, {project_id, assignee_id})` for one batch.
- 5.1: someday-and-evening has landed, so `HAS_SOMEDAY` is `true` and `y` parks through `parkWithUndo`.
- Progress is the position (index + 1), as the spec defines n. Tasks decided this session keep their place in the queue, so completing, trashing or moving does not shrink the count; only undecided tasks that leave the Inbox elsewhere drop out (the "one task fewer" scenario). Positions whose task was trashed are passed over in the direction of travel, so `k` never lands on a missing card.
- Leaving selects the task the mode was on, through a `selectTask` channel next to `openTask` that the list takes on its next route change.
- With Vim keybindings on, the Vim layer handles `j` / `k` / `x` / `dd` through the mode's `ListState`, and the mode's own handler skips events the Vim layer already handled.
- `scripts/e2e-smoke.mjs` had gone stale since ux-overhaul: the sidebar's + is a menu, the task panel's priority and date chips changed, and the sync indicator no longer shows the word "Synced". The script now sets priorities and dates through quick add, polls the server instead of the sync text, and compares local dates. It passes again with the new triage step.

## Smoke test (2026-10-16, task 4.2)

Ran a fresh `./bin/opentodo` with sixteen Inbox tasks, in headless Chromium.
- **Ten decisions, keyboard only:** t, s with "fri", m with "Home", c, Delete, j, y, Space, t, c. The mode read "11 of 16", and the live region said "Completed: Item 10. 11 of 16: Item 11".
- **Vim on:** after a reload, `x` completed the card and `dd` trashed the next. Items already moved, completed or trashed were not in the new session's queue.
- **Offline:** three decisions (today, complete, trash), then a reload, then reconnecting. A second browser context signed in to the same account saw the first task due today, the second completed and the third in the Trash.
- **Not done:** a real screen-reader check (VoiceOver or NVDA isn't available here). The live region's texts are asserted in `triageView.test.tsx`, and axe runs in the layout check.
