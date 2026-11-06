## Context

`agenttools.Limiter` keeps, per token id, the call times of the last minute and the entities changed today. `Registry.write`, `writeAll` (REST) and a routine run through `run_routine` call `AllowCall`, `Reserve` and `Refund` with `Caller.TokenID`. The caller also carries `UserID`.

## Decisions

### D1 — One limiter, two keys

The limiter keeps an account's counters in the same map as tokens, under `account:<user id>` (token ids are UUIDs and never carry the prefix), so the idle sweep and the day reset work for both. `AllowCallFor(user, token)` checks the token's minute, then the account's, and records the call on both only when both have room. `ReserveFor(user, token, n)` books on both only when neither would pass its day budget. `RefundFor` returns to both. The token-only `AllowCall`, `Reserve` and `Refund` stay as wrappers with an empty account, for callers and tests that have no person.

### D2 — Values

Account: 60 calls a minute and 2,000 items a day, twice a token's. Equal values would make the token limit redundant and let one runaway token block the person's other assistant for the rest of the day; no account limit is what the threat model calls a gap. Two simultaneous assistants rarely meet twice the single-token budget, and any number of tokens now stays within it.

### D3 — Messages

The `rate_limited` message names both limits ("at most 30 write calls per minute for each token and 60 for each account"), so the agent and the person reading it know which budget exists without a new error code.

## Data model

None: counters are in memory, as before. No ops; offline behaviour and convergence are unaffected (a refused call writes nothing). No dependency; no effect on image size or memory beyond one entry per account with an active agent.

## Risks

- A person running several busy assistants at once may now meet the account limit where they did not before. The limit resets each minute and each UTC day, and the docs state it.
