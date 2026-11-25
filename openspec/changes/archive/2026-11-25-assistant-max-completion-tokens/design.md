# Design

## Context

`ChatProvider` (`internal/assistant/chat.go`) and its browser twin `chatProvider` (`web/src/lib/assistantDevice/providers.ts`) send the turn's token limit as `max_completion_tokens` on the OpenAI provider and as `max_tokens` on Gemini and compatible endpoints. OpenAI's reasoning models take only `max_completion_tokens`. Azure OpenAI's v1 API takes OpenAI's request format with the deployment name as `model` and the API key as a Bearer token, and answers a request with `max_tokens` for such a model with:

```json
{"error":{"message":"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.","type":"invalid_request_error","param":"max_tokens","code":"unsupported_parameter"}}
```

which OpenTodo reports as `provider_error` ("the provider refused the request"), as in issue #2087.

## Goals / Non-Goals

**Goals:** reasoning models behind Azure OpenAI's v1 endpoint, or any compatible endpoint that forwards OpenAI's refusal, answer turns, routines and **Test connection**, on the server and on the device, with no setting. Nothing changes for servers that accept `max_tokens`.

**Non-Goals:** Azure's older deployment-scoped API (`/openai/deployments/<name>/...?api-version=`); the Responses API.

## Decisions

### D1. Ask again on the provider's own signal, as for reasoning_effort

The adapter reads the `param` of a 400 once (`refusedParam`) and `askAgain` decides: `reasoning_effort` on a request with tools sends `reasoning_effort: "none"` (unchanged), `max_tokens` with `code` `unsupported_parameter` on a request with a limit sends the limit as `max_completion_tokens` (another code, such as `invalid_value` for a limit that is too large, is reported as is). An image refusal is classified first, on the server as on the device. Each happens at most once per conversation and neither uses up a 429/5xx retry, so a model that needs both is answered on the third request whichever it names first.

Alternatives: always sending `max_completion_tokens` to compatible endpoints breaks servers that know only `max_tokens`; detecting Azure by host would build a provider host into behaviour and miss routers that forward OpenAI's refusal; a setting adds a field the owner must know to set.

### D2. Per turn, not remembered

As for `reasoning_effort` (assistant-reasoning-effort-none D2): the flag lives on the conversation, so a new turn costs one quick refused request.

## Data model

None. No op, no setting, no stored field.

## Risks / Trade-offs

- Up to two extra quick requests per turn for a model that needs both changes. Accepted (D2).

## Size and memory

No dependency; no change to image size or memory.
