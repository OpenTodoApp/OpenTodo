# Design

## Context

`Registry.write` reserves a write's entity count before applying a change set and refunds it when nothing was applied. `run_routine` has no change set. Its writes are made by the rules engine as the routine, and the count is known only after the run. Before this change the count was booked after the run with `Reserve`, and its refusal was ignored.

## Decisions

### D1. Hold the rest of the budget, cap the run, settle

`Limiter.Hold(token)` books everything left of today's items and returns how much that was. When nothing is left it returns 0 and the seconds until the next UTC day. The registry passes the held amount to the engine as `RunRequest.MaxWrites`. After the run, `Limiter.Settle(token, held, written)` gives back the part the run did not write.

Holding the whole rest, rather than an estimate, means the budget cannot be overspent by calls that run at the same time with the same token. A write call made by that token while a run is in progress is refused as over the daily limit. Runs take at most 60 seconds, so that refusal is short-lived.

### D2. The engine checks the plan before it writes

A routine run plans every step and writes only when the whole plan succeeded (`routines-engine` D5). The cap is checked there: when `planned > MaxWrites`, the run is finished as `failed` with the reason *the AI assistant's daily write limit has N items left and this run would write M*, and nothing is written. Because the run is logged, the person sees in the run log why it did not happen. A proposal (a routine with AI steps outside Apply without asking) writes nothing at run time and is not capped. Applying a proposal is the person's write, in the app.

Running a test first to learn the count was rejected. A test of a routine with AI steps calls the model, so it would double the AI cost of every run.

### D3. Device runs are settled, not capped

On an encrypted account, a routine with content or AI steps runs on one of the person's devices (`routines-ai-step` D7). The server does not plan those writes, so it cannot apply the cap before they happen. `Settle` books what such a run actually wrote, even when that is more than was held. The budget can therefore be exceeded by at most one run of at most 500 items, and every later write call that day is refused.

### D4. Tests are free

`run_routine` with `test: true` writes nothing. It holds nothing and is not refused at the limit, so an assistant can still check a routine after its budget is spent.

## Data model

None. The counters stay in memory, as before.

## Size and memory

No dependency, no bundle change. Two small limiter methods.
