# Proposal

## Why

GPT-6 Luna does not work with the assistant on the OpenAI provider (GitHub issue [#2045](https://github.com/OpenTodoApp/OpenTodo/issues/2045)). OpenAI documents that GPT-6 Luna and GPT-6 Sol, like the GPT-5.6 models, call function tools in Chat Completions only with `reasoning_effort: "none"`; their default effort is `medium`, so leaving the field out is not enough. Every assistant request carries tools, and OpenTodo never sends `reasoning_effort`, so OpenAI answers 400 with `"param": "reasoning_effort"` and the turn and **Test connection** fail.

Sending `reasoning_effort` on every request is not an option: older OpenAI chat models and many OpenAI-compatible servers refuse a parameter they do not know.

## What Changes

- When a Chat Completions request with tools is refused with HTTP 400 and an error whose `param` is `reasoning_effort`, the server's provider and the on-device assistant send the same request once more with `reasoning_effort: "none"`, and keep it for the rest of that turn. A second refusal is reported as before.
- No other request changes: nothing new is sent unless the provider asks for it, so models and servers that work today see the same requests.
- No setting, no model id built into behaviour, no new environment variable.

## Out of scope

- OpenAI's Responses API (reasoning together with function tools). It would be a second wire format beside Chat Completions for the OpenAI provider; a follow-up can propose it.
- A reasoning-effort setting per provider or model.

Fixes a bug in the shipped assistant (`in-app-assistant`); advances no ROADMAP item. No new environment variable, no op-log change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `in-app-assistant`: Chat Completions requests are asked again with `reasoning_effort: "none"` when a model needs it for tools.
