# Proposal: assistant-eval-gaps

## Why

The first eval run against a real model (`anthropic` / `claude-sonnet-5-5`, 2026-11-10, recorded in `assistant-lean-tools` task 1.2) failed four scenarios for three causes in the tools and the loop, not the model:

1. `board-column`: no read tool named a project's sections, so the model could not pass the "In progress" column to `show_board` and showed the whole board.
2. `errands-map` and `complaint-no-repeat`: `search_tasks` matched titles and descriptions only, so "errands" found none of the tasks labelled "errand"; the model then answered with follow-ups and no words.
3. `one-task-link`: the model showed one task as a block, and its text before the call ran into the text after it ("…one task:You have one task…") because the rounds' text was joined with nothing between.

## What Changes

- **`list_projects`** (and `opentodo://projects`) carries each project's sections in board order: id, flow mode and name. Additive.
- **Label matching:** `search_tasks` also finds tasks by label (the name holds the query, or the query is the name with a plural `s` or `es`), and `list_tasks`' `label` finds a label by that plural when no label has the name. It only adds matches and never stems, so other languages keep their results. Server and device share the vectors.
- **Rounds' text:** the text of a round after tool calls starts a new paragraph when the text before did not end one.
- **One task is a link:** in a chat turn, `show_tasks` with one task (after the id checks) shows nothing and answers with the link to write instead. Routines' AI steps are unchanged.
- **Always words:** `suggest_followups` before any text in a chat turn answers that the answer still needs words; the instructions say that blocks and follow-ups never replace the answer and that text before a tool call is never repeated.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mcp-server`: a new requirement, "Read tools name sections and match labels".
- `assistant-blocks`: a new requirement, "Answers are words first".

## Out of scope

- Stemming or plural rules beyond a trailing `s` or `es`, and matching labels in the saved-view filter grammar.
- A paid eval run: the next real run confirms the scenarios.

## Roadmap

A follow-up to `assistant-eval` in the Assistant area.

## Impact

- `internal/agenttools` (`read.go`, `read_search.go`, `labelmatch.go`), `internal/assistant` (`loop.go`, `blocks.go`, `manifest.go`) and their device twins in `web/src/lib/assistantDevice` (`read.ts`, `labelMatch.ts`, `blocks.ts`, `loop.ts`, the manifest and vectors).
- No op schema change, nothing stored, no new route, no change to what is sent to a provider (section names were already in task results). Web: only the lazily loaded assistant device code; the first-load entry is unchanged.
