# Design

## Context

`anthropic.go` sets `CacheControl` ephemeral on every request and sums `InputTokens + CacheCreationInputTokens + CacheReadInputTokens` into `Round.Input`. The Chat Completions adapter reads `usage.prompt_tokens`. Usage is stored per user and month in the assistant store.

## Decisions

### D1. Three numbers per round

`Round` gains `CachedRead` and `CachedWrite`. `Input` stays the fresh input. The route records all three. The counted total is `Input + CachedWrite + ceil(CachedRead/10) + Output`. The factor of one tenth matches Anthropic's pricing and is close to OpenAI's and Gemini's cached rates.

The alternative, not counting cache reads at all, was rejected: they still cost the owner money.

### D2. Storage

Migration `NNNN_assistant_usage_cached.sql` adds `cached_read` and `cached_write`, both default 0, to the usage table. Older rows read 0, so their totals don't change.

### D3. Display

The usage line reads "20,300 tokens, 18,000 from cache · this month 3% of your limit". The on-device loop reports the same fields to the panel; its usage stays local as today.

## Data model, size, memory

- **Data:** no op change, only server-side usage columns.
- **Size and memory:** no new dependency.
- **Interface budget:** no new chrome.

## Risks / Trade-offs

- **Provider field drift.** Each adapter has a test with a recorded usage payload.
