# Spec Delta

## ADDED Requirements

### Requirement: Cached input in usage
Each turn SHALL record input read from the provider's prompt cache apart from fresh input, for every provider that reports it. Toward the monthly cap, cache reads SHALL count at one tenth and cache writes in full. The answer's usage line SHALL name the cached part, and `GET /api/v1/me/assistant/usage` SHALL report `cached_tokens` beside its totals. Turns recorded before this have no cached part and count as recorded.

#### Scenario: A cached turn
- **WHEN** a turn's provider reports 18,000 cache-read input tokens, 2,000 fresh input tokens and 300 output tokens
- **THEN** 4,100 tokens count toward the cap, and the answer shows "20,300 tokens, 18,000 from cache"

#### Scenario: Usage route reports cache
- **WHEN** a signed-in user calls `GET /api/v1/me/assistant/usage` after that turn
- **THEN** the response includes `cached_tokens: 18000` and the counted total of 4,100 for it

#### Scenario: Unauthenticated usage request
- **WHEN** a request without credentials calls `GET /api/v1/me/assistant/usage`
- **THEN** the response is 401 `unauthorized`
