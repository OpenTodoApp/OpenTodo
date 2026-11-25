# Proposal

## Why

Azure OpenAI's v1 endpoint (`https://<resource>.openai.azure.com/openai/v1`), set up as a compatible endpoint with a reasoning model deployment such as `gpt-6.2-sol`, fails **Test connection** with `provider_error` (GitHub issue [#2087](https://github.com/OpenTodoApp/OpenTodo/issues/2087)). The Chat Completions adapter sends the token limit as `max_completion_tokens` only on the OpenAI provider and as `max_tokens` everywhere else. OpenAI's reasoning models refuse `max_tokens` with HTTP 400, `"param": "max_tokens"`, `"code": "unsupported_parameter"`, and Azure passes that refusal on. The same models also need `reasoning_effort: "none"` for tools, which the adapter already handles (`assistant-reasoning-effort-none`), but the `max_tokens` refusal is not.

Sending `max_completion_tokens` to every compatible endpoint is not an option: many compatible servers know only `max_tokens` and would ignore the limit or refuse the field.

## What Changes

- When a Chat Completions request is refused with HTTP 400 and an error whose `param` is `max_tokens`, the server's provider and the on-device assistant send the same request once more with the limit as `max_completion_tokens` instead, and keep it for the rest of the turn. A second refusal is reported as before.
- The `reasoning_effort` retry and this one are independent: a request may be asked again once for each.
- `docs/assistant-setup.md` says how to set up Azure OpenAI as a compatible endpoint.
- No setting, no model id or host built into behaviour, no new environment variable.

Fixes a bug in the shipped assistant (`in-app-assistant`); advances no ROADMAP item. No op-log change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `in-app-assistant`: Chat Completions requests are asked again with `max_completion_tokens` when a model refuses `max_tokens`.
