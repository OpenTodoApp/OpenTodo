# Design

## Decisions

### D1. Same tools, smaller set

`routine.go` offers the AI step `show_tasks`, `show_calendar` and `show_deadlines` from `DisplayTools`, checked by the same `displayTurn`. The emitted blocks are collected into the run result, at most four per run.

Choices made while building it:

- **Ask AI steps answering in text only.** Summarise has a fixed instruction the person did not write, so a block there would never be asked for and the tools would only cost tokens; a Lines answer feeds list steps (Create tasks per line), where ids in the material could leak into titles. A call's `Show` is the run's four less the blocks already shown; `Show == 0` offers no tool and sends the plain `RoutineSystem`, so every other call is unchanged.
- **The run keeps kind and parameters, never text.** `tasks {ids}`, `calendar {date, span}`, `deadlines {from, to}`. The model's `show_tasks` title is dropped (it is the model's words), which also keeps an encrypted account's run free of plaintext. The chat's `{at, block}` offsets are dropped too: the run never stores the step's text, so there is nothing to place them in; blocks render in order under the run's line.
- **Rounds.** A step that may show blocks makes at most three provider calls (`MaxRoutineRounds`): blocks, then the answer; a model still asking to show after that ends with the text and blocks it has. The 60-second call timeout covers all of them; every round's tokens count toward the step, the routine's daily budget and the allowance.
- **Ids in the material.** For a step that may show blocks, each task line reads `- title (id …, due …)`, so `show_tasks` can name it; `RoutineShowNote` says to use only those ids. `EstimateTokens` counts the tools' definitions.
- **Where it lives.** `internal/assistant` runs the rounds (`RoutineToolDefs`, `RoutineSystemFor`, `routineRounds`); `internal/rules` keeps the blocks (`RunBlock`, checked by `valid()`, at most `MaxRunBlocks`) in the column `rule_runs.blocks_json` (added like the other routines-ai-step columns, idempotently); `internal/httpapi` converts between them. A step keeps at most `Show` blocks from an answer, so a step not offered the tools keeps none.
- **The device** gets the same instructions, note, tools, rounds and limit from the manifest (`routine`); `deviceAI.ts` runs the rounds with `runDisplay` from the assistant's device blocks (the ids checked against this device's rows) and `deviceRun.ts` sends the blocks with every commit (never with a failure). The server checks a device's blocks (`checkRunBlocks`: kinds, ids, days, at most four; `400 invalid_input` otherwise).
- **No disclosure change.** The new things sent to the provider are the three tool definitions and the tasks' ids, opaque identifiers the chat already sends; no content is added, so no disclosure version bump or notice.

### D2. Rendering

The routine inbox imports `AnswerContent`'s `BlockFrame` lazily through `RunBlocks.tsx`, so the routine inbox stays light. The device runner (encrypted accounts) records blocks the same way.

- **Inbox card:** the blocks of a line's newest run, for a success or a proposal line, in a list item right under the line (the line itself is unchanged, so a card without blocks looks as before). A failure line shows none.
- **Run detail:** above the steps, under the run's outcome.
- **The bell's notice stays one line.** A Notify me notification opens the run, where the blocks are; a calendar in the bell's popover would crowd it. The spec names the card and the run's detail.

### D3. Ordering with `mcp-blocks`

Both this change and `mcp-blocks` modify "Display tools are for the in-app assistant only". Whichever archives second updates its MODIFIED block to the text the first one left before archiving.

## Data model, size, interface budget

- **Data:** the run result gains `blocks`, server state rather than an op. Additive: a 1.0 client reads a run with unknown fields as before (the web app and the CLI ignore them), and an older device commits without `blocks`.
- **Size:** renderers are shared, lazy chunks; `RunBlocks` is its own chunk, loaded only for a run with blocks. The entry chunk is unchanged.
- **Interface budget:** blocks sit inside the existing card; no new scroll region (each block is bounded).

## Risks / Trade-offs

- **Stale ids in old runs.** Blocks render "Removed" for deleted entities, as in the chat.
