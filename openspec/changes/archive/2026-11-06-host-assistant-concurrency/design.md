## Context

`assistant.Service.Acquire` reserves a person's single turn and one of `MaxConcurrentTurns` (8) server-wide slots. Each tenant builds its own `Service` in `httpapi`, so a host with N open tenants allows 8 × N turns on the operator's provider keys.

## Decisions

### D1 — A shared cap, owned by the host

The count of running turns moves into `assistant.Slots` (a mutex, a count and a cap). A self-hosted server's service builds its own, as before. The host builds one `Slots` of 8 when it opens and passes it to every tenant in `services.Hosted.AssistantSlots`; the tenant's service uses it through `UseSlots`. A tenant closed while a turn runs keeps its release function, which returns the slot to the same `Slots`, so closing and reopening a tenant cannot leak or double a slot.

### D2 — The per-person turn stays per tenant

User ids are per tenant, so `turn_in_progress` keeps its map in each tenant's service. Only the server-wide count is shared.

### D3 — The same number

The host-wide cap is 8, the number a self-hosted server already has: it is the load one operator key was sized for. A host where 8 is too few can be given a setting later; none is added now (no new environment variable).

## Data model

None: the count is in memory, as before. No ops; offline behaviour and convergence are unaffected (a refused turn reads and writes nothing). No dependency; no effect on image size or memory.

## Risks

- On a busy host one tenant's people can take all 8 turns, and the others get `assistant_busy` until a turn ends (at most the 5-minute turn timeout). That is the same fairness a self-hosted server with many members has; the per-tenant request limits still bound how often one client can try.
