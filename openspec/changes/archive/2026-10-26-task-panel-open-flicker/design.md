# Design

## Context

See proposal.md, "Why". The parts of `web/src/app/PanelHost.tsx` that matter:

- **Line 31.** `useTask(taskId)` returns `undefined` while its Dexie live query has not answered for the new id. That always takes at least one render, because the query is asynchronous.
- **Lines 47-53.** `held` keeps the last task that was shown, and `shownTask` falls back to it while the next task is `undefined`. After going to another list, the occupant is cleared, so `held` is set to `null` (line 52).
- **Line 60.** With no occupant on a wide split page, the slot renders `SplitPane` with the page's empty pane, "No task selected".
- **Line 62.** With a task occupant and no `shownTask`, it renders `null`. That is the frame where the slot disappears.
- **Lines 39-45.** `enteredFor` is set whenever the shown task id goes from `null` to a value, which also covers "from the empty pane".

The existing #383 regression test (`web/src/app/sidePanel.test.tsx:111`) only switches between two tasks, so `held` is always set there. That is why it passes while #442 remains.

## Goals / Non-Goals

**Goals:**
- At every render between choosing a task and seeing it, the slot shows either the empty pane or the task, at the same width.
- Motion follows the slot's visibility, not the task id: no entrance when the slot was already visible.

**Non-Goals:**
- Making the task read synchronous, or prefetching on hover.
- Changing the Inbox split's own pane or the narrow-screen page behaviour.

## Decisions

### D1. While a newly docked task is still undefined, render what the slot showed before

When `taskId` is set, `task === undefined` and there is no held task, `PanelHost` returns the same `SplitPane` with the page's empty pane that line 60 renders. It does so when `empty && wide`, and returns `null` otherwise (no split, a narrow screen, or the Inbox's split, which keeps its own behaviour). The empty pane is then replaced by `TaskDetail` in one commit, as soon as the read answers.

Alternatives considered:

- **A blank frame of the panel's width instead of the empty pane.** Rejected: it trades one flash (the pane disappearing) for another (the text disappearing, then the task appearing). Keeping the pane until the swap is a single change on screen.
- **Seed `useTask` synchronously from the list's row data.** Rejected for this fix: it touches the data layer and every caller of `useTask`. D1 is local to the slot.

### D2. Slide in only when the slot was not visible

`enteredFor` is set only when the previous render showed neither a task nor the split's empty pane. The rule becomes "the slot was not on screen", which is what "Overlay motion" means by "opened from closed". Opening a closed side panel, and opening on a page without an empty pane, still play `panel-enter`. Switching tasks and filling the empty pane don't.

### D3. Confirm the cause before changing code

The first task records the frames in Chrome on the issue's path, using the Performance panel with screenshots. It confirms both effects: a frame without the slot, and the `panel-enter` fade. If the recording shows a third cause, for example a remount of the whole list on project change, it gets noted in this design before D1 and D2 are implemented.

**Outcome (task 1.1).** No interactive Chrome recording was made; the cause was confirmed instead by the regression test of task 2.1, which reproduces the issue's path in happy-dom. On `main` it failed on both counts: one DOM mutation left neither the empty pane nor a docked task (the empty frame), and the docked panel carried `panel-enter` (the replayed slide-in). A third case showed up while testing: a task id that turns out not to exist also rendered nothing for a frame, between the read answering `null` and the effect closing the occupant. D1 therefore keeps the empty pane whenever there is no task to show, not only while the read is pending. No remount of the list was involved.

### Interface budget

No chrome, property, scroll region or shortcut changes. The fix removes a layout shift.

### Size

A few lines in one component. There's no effect on the bundle, the binary or memory, and no dependency.

## Risks / Trade-offs

- **[The empty pane shows a moment longer while a slow read finishes]** On a very large database the "No task selected" text stays until the task arrives instead of the slot going blank. → That is the intended behaviour, and the same as #383's held task.
- **[A deleted task linked from the empty pane]** `useTask` answers `null` and the existing effect closes the occupant (line 56-58), so the empty pane simply stays. → Covered by the "A task that does not exist" scenario and a test.
- **[`enteredFor` regressions]** → `panelMotion.test.tsx` keeps its "slides in from closed, not when the shown task changes" case and gains the empty-pane case.
