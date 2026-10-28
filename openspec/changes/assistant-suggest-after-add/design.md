# Design

## Context

`lib/assistantStatus.openAssistantWith({ text, skill, selected, send })` already opens the panel with a prefilled turn (used by "Break down" in a task's menu). `lib/ops.createTask` is the one place a task is written. Three quick-add paths call it for a typed line: `TaskListView.onAdd`, `palette/addFromBar` and `QuickAddSheet`.

## Decisions

### D1. Ask from the device that added the task

The turn runs with the person's session (`POST /api/v1/assistant/turn` accepts sessions only), reads what the server already allows, and returns a change set that the existing review applies. A webhook receiver would need an agent token, a private-target allowance and a second code path; none of that is needed to answer a question about one task.

### D2. One helper, `createTaskThenSuggest`

`lib/assistantSuggest.ts` wraps `createTask` for the three paths: the task is written first, then `suggestAfterAdd(id, title)` runs without being awaited. It checks the device switch and the account status (`enabled`, `available`, `consented`) and does nothing otherwise. Every failure is caught: the task exists, a suggestion is a bonus. The wrapper keeps `TaskListView` under its line limit.

### D3. The prompt is not translated

It is an instruction to the model, not text a person reads, and the model is told to answer in the task's language. Translating it would add five catalogue entries that can drift from the English one.

### D4. Off by default

Each add that asks costs one assistant turn and opens the panel. The switch is per device so a phone can stay quiet while a desktop asks.

## Risks

- A fast series of adds sends one turn each; the server already allows one answer at a time per person, so the later ones are refused with the usual "busy" notice and the person can ask again from the panel.
- The model may over-edit a title. The review is the barrier: nothing is written before Apply, and Undo restores it.
