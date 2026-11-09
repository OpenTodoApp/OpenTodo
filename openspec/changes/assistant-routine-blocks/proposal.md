# Proposal: assistant-routine-blocks

## Why

Routines can already run an AI step on a schedule, for example a morning summary. Its answer arrives as text in the routine inbox. With blocks, the morning briefing would show the day's agenda, deadlines and the tasks to start with, live.

## What Changes

- **Routines' AI steps** may use the display tools `show_tasks`, `show_calendar` and `show_deadlines`, at most 4 per run.
- **Their blocks** are stored with the run's result as kind and parameters only, never content, and rendered in the routine inbox card and its notice with the same renderers as the chat.
- **No writing:** a block in a routine run is read-only. Ticking a task in it is the app's own completion.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`: display tools may be offered to routines' AI steps.
- `routine-inbox`: routine runs show their blocks.

## Out of scope

- Choices and follow-ups in routine runs: nobody is there to answer.

## Roadmap

A follow-up to `routines-ai-step` and `assistant-generative-ui`.

## Impact

- `internal/assistant/routine.go` (the AI step's tools), the run record (a `blocks` field), and the routine inbox renderers. The device runner too, for encrypted accounts.
