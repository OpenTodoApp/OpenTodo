# Proposal: assistant-in-context

## Why

The assistant lives in a panel and a page. The moments where it helps most are elsewhere: on a vague task ("rewrite this", "break it down", "find me a slot"), on a project ("what's next?"), and on Today in the morning ("brief me"). Starting there saves explaining the context.

## What Changes

New built-in skills, each started from where its context is:
- **Rewrite this** (`rewrite-task`): a clearer title and description for the selected task, as a proposal. From the task's menu and panel.
- **Find a slot** (`find-slot`): a do-on date and time for the selected task in a free slot of the next 7 days, as a proposal, using `find_free_time`. From the task's menu.
- **What's next?** (`project-next`): the next actions of a project, with the board or timeline block. From the project's header menu.
- **Brief me** (`brief-today`): a short summary of the day, with the agenda, deadlines and stats blocks. From Today's overflow menu.

Each entry opens the assistant with the skill and the subject selected, and sends at once. **Break this down** keeps its entry. Entries appear only while the assistant is available to the user.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-skills`: new skills and their entry points.

## Out of scope

- Automatic briefings without a click (routines can do that: `assistant-routine-blocks`).

## Roadmap

A follow-up to `assistant-skills`. It needs `assistant-time-blocks` (for `find_free_time`) and `assistant-project-blocks`.

## Impact

- `internal/agenttools/skills.go` (four skills), `internal/assistant` (their display tools), the manifest and MCP prompts (skills are served as prompts).
- Web: menu items in the task menu, the project header menu and Today's overflow menu, through `openAssistantWith`.
