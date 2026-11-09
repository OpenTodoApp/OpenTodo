# Proposal: assistant-usage-cache

## Why

A single "what's overdue?" showed "20,112 tokens · 16% of your limit". The Anthropic provider already caches the system text and tools across the rounds of a turn. But usage adds cache reads and cache writes to input at full weight (`internal/assistant/anthropic.go`), and cache reads cost about a tenth of normal input. So people on the monthly cap are charged several times what their turns really cost, and the number under each answer looks alarming.

## What Changes

- **Recorded separately:** each turn records cached input apart from fresh input, for every provider that reports it (Anthropic cache reads and writes; OpenAI-compatible `prompt_tokens_details.cached_tokens`; Gemini `cachedContentTokenCount`).
- **Weighted for the cap:** cache reads count at one tenth, and cache writes at full weight.
- **Shown under each answer:** the tokens it used and the part read from cache. The usage route reports cached tokens too.
- Old usage rows have no cached part and keep counting as before.

## Capabilities

### New Capabilities

### Modified Capabilities

- `in-app-assistant`: a new requirement, "Cached input in usage".

## Out of scope

- Sending fewer tools per turn (`assistant-lean-tools`).
- Changing the default cap.

## Roadmap

A follow-up to `in-app-assistant` (shipped AI row 3).

## Impact

- `internal/assistant`: `Round` gains cached input; the providers read the cache fields.
- `internal/assistant/store`: usage gains a `cached` column through a migration.
- `GET /api/v1/me/assistant/usage` gains `cached_tokens`.
- The web app's usage line.
