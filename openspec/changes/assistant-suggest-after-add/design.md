# Design

## Context

`lib/assistantStatus.openAssistantWith({ text, skill, selected, send })` already opens the panel with a prefilled turn (used by "Break down" in a task's menu). `lib/ops.createTask` is the one place a task is written. Three quick-add paths call it for a typed line: `TaskListView.onAdd`, `palette/addFromBar` and `QuickAddSheet`.

The server and the on-device loop share `MaxRounds` through the generated `assistantDevice/manifest.json`; both count model calls, not tool rounds.

## Decisions

### D1. Ask from the device that added the task

The turn runs with the person's session (`POST /api/v1/assistant/turn` accepts sessions only), or with the on-device assistant when the account is encrypted and the owner allows it. Either way it reads what the account may read and returns a change set that the existing review applies. A webhook receiver would need an agent token, a private-target allowance and a second code path; none of that is needed to answer a question about one task. The device also knows the status without a round trip, so the check costs nothing when the switch is off.

### D2. One helper, `createTaskThenSuggest`

`lib/assistantSuggest.ts` wraps `createTask` for the three paths: the task is written first, then `suggestAfterAdd(id)` runs without being awaited. It checks the device switch and the account status (`enabled`, `available`, `consented`) and does nothing otherwise. Every failure is caught: the task exists, a suggestion is a bonus. The wrapper keeps `TaskListView` under its line limit and leaves pasted batches (`addTasksUndoable`) untouched, so one paste does not send one turn per line.

### D3. The prompt is a translated-nowhere constant

It is an instruction to the model, not text a person reads, and the model is told to answer in the task's language. It is one constant (`SUGGESTION_PROMPT`, "Improve the selected task: …"): the task is named by the turn's `selected`, never by text spliced into the instruction, so a title with quotation marks cannot end a quote early or add instructions. Translating it would add five catalogue entries that can drift from the English one. The switch's own label and description are translated.

### D4. Off by default

Each add that asks costs one assistant turn and opens the panel. The switch is per device so a phone can stay quiet while a desktop asks. It lives in the device's `meta` table, never in an operation, so it does not sync and needs no export change.

### D5. The turn's step budget is 12 model calls

A turn that keeps planning ("then break each of these down") needs more rounds than the live spec's 8. The loop is bounded by model calls, not tool-use rounds: every call to the provider counts, including the one that answers `end_turn`. The 12th call may still end the turn with a change set; only a tool-use answer on the 12th call is refused the next round and stops the turn with `round_limit`. The change's spec delta carries the MODIFIED requirements, the docs' `round_limit` line names the same number, and the system rules ask for few steps so a normal request does not need the whole budget.

### D6. A suggestion is never applied by itself and never replaces what is on screen

The question is a normal turn, and a device that applies small changes without review would apply a priority or a label the model also proposed, on a turn the person did not type. The prefill therefore carries `review: true`: the conversation shows the change set for review whatever that setting says (as for a capture), for that send only. The panel takes focus as any modal does. Leaving the cursor in the quick-add line was rejected: the sheet's backdrop covers that line and the dialog is `aria-modal`, so the person would type into a field they cannot see or click, and a screen reader would be told the page behind is unavailable while focus is in it.

A second add in a row (three tasks from the add bar is a common capture flow) is skipped, not queued, while the assistant is busy: the panel is open (a turn runs, a proposal waits for review, or the person is typing in it), a request waits for the panel, or a turn runs on the Assistant page. Replacing the prefill would put the second question in the draft while the first streams and, once the first turn ended, send it, which clears the first proposal before it could be applied. A queue would pop the panel open again later, over whatever the person moved on to, with a proposal about a task they have stopped looking at; a suggestion is a bonus, so a skipped one costs little, and closing the panel (or applying or discarding the proposal) makes the next add suggest again.

## Interface budget

The settings row adds one line to an existing card (`docs/interface-guide.md` allows at most 2 rows of chrome above a list's first item and at most 7 task properties; neither changes). The panel is the existing assistant panel: no new scroll region, no new shortcut, no new primary destination. The switch uses the existing `SettingRow` and `Switch`, with its label hidden as the neighbouring row does.

## Data model and size

No op field, entity or API route changes. The switch is one device-local `meta` key. No dependency is added, so the container image and runtime memory do not grow.

## Risks

- A fast series of adds suggests for the first only (D6); the others are added without a suggestion and the person can ask from the task's menu.
- The model may over-edit a title. The review is the barrier: nothing is written before Apply, and Undo restores it.
- Twelve calls cost more than eight on a long turn. The monthly usage limit and the one-turn-per-person rule still apply, and the system rules ask the model to work in few steps.
