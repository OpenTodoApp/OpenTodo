# Design

## Context

The one Chat Completions adapter (`ChatProvider` in `internal/assistant/chat.go`, for OpenAI, Gemini and compatible endpoints) and its browser twin (`chatProvider` in `web/src/lib/assistantDevice/providers.ts`) send `model`, `messages`, streaming, `tools` with `tool_choice: "auto"` and a token limit. OpenAI's model page for GPT-6 Luna (checked 2026-11-25) says: "Chat Completions supports function calling only with `reasoning_effort` set to `none`", and `medium` is the default. The refusal OpenAI sends for such a request (seen for gpt-5.6-luna in a public bug report):

```json
{"error":{"message":"Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.","type":"invalid_request_error","param":"reasoning_effort","code":null}}
```

## Goals / Non-Goals

**Goals:** GPT-6 Luna and similar models answer turns, routines and **Test connection** through the OpenAI provider, on the server and on the device, with no setting. Nothing changes for any other model or server.

**Non-Goals:** the Responses API; a reasoning-effort setting.

## Decisions

### D1. Ask again on the provider's own signal, not by model id

The adapter adds `reasoning_effort: "none"` only after a 400 whose error (or the body's top level) has `param: "reasoning_effort"`, and only for a request with tools. It is the field OpenAI names, so the test does not read the provider's message (which stays used for classification only, as the error-reading requirement says). The retry happens in the same `post`, before any stream is read, at most once per turn: the conversation keeps the field for its later rounds, and a refusal of the retried request is reported like any other 400.

Alternatives: always sending `reasoning_effort` breaks models that do not take it (OpenAI's older chat models, many compatible servers); matching model ids would build non-Anthropic model ids into behaviour, which `Supported providers` rules out; a setting would add a field the owner must know to set. A compatible endpoint that forwards OpenAI's refusal (for example a router) benefits the same way, so the rule applies to every Chat Completions provider.

### D2. Per turn, not remembered

The flag lives on the conversation. A new turn costs one quick refused request before it is asked again; remembering it across turns would add shared state for a few hundred milliseconds.

## Data model

None. No op, no setting, no stored field.

## Risks / Trade-offs

- One extra request per turn for these models. Accepted (D2).
- `reasoning_effort: "none"` means the model does not reason while calling tools; that is what Chat Completions allows for it. The Responses API would lift this and is left for a follow-up.

## Size and memory

No dependency; no change to image size or memory.
