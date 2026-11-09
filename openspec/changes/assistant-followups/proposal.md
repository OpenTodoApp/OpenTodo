# Proposal: assistant-followups

## Why

After an answer, the obvious next steps ("Schedule these", "Break down #2", "Move the rest to tomorrow") have to be typed. Modern assistants offer them as one-tap suggestions, which also teaches people what the assistant can do.

## What Changes

- A display tool, `suggest_followups`, offered to the in-app assistant on the server and on the device: up to 3 short suggestions, at the end of an answer.
- They show as chips under the answer. Tapping one sends its text as the next message.
- Only the latest answer's chips are active, and they never appear after a choice block (`ask_choice` already asks).
- They don't count toward the 4-block limit, but there is at most one call per answer.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`: a new requirement, "Follow-up suggestions".

## Out of scope

- Suggestions derived by the app without the model.

## Roadmap

A follow-up to `assistant-generative-ui`.

## Impact

- `internal/assistant/blocks.go`, the manifest, and the chip renderer in `app/assistant`.
