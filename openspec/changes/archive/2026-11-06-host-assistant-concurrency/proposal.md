# One assistant concurrency limit for the whole host

## Why

The threat model (`docs/security/threat-model.md`, "Another tenant in host mode") lists as not defended that the in-app assistant's limit of 8 running turns is counted per tenant: with many tenants open, the operator's provider keys see 8 turns for each of them, so one host's load on a provider grows with every open tenant. Hardening item 6.7 of `external-security-review`.

## What Changes

- In host mode, the 8 running assistant turns are one limit for all of the host's tenants together. A turn beyond it answers the existing 503 `assistant_busy` with `Retry-After`, in whichever tenant it starts.
- The one turn per person (409 `turn_in_progress`) stays per tenant.
- A self-hosted server is unchanged: 8 turns, one per person.

No new route, setting or environment variable. Not **BREAKING**: the error and its code are the ones a busy server already answers.

Out of scope: a per-tenant share of the host's turns, an operator setting for the number, and the monthly token allowance, which stays per tenant.

ROADMAP: hardening of the shipped `in-app-assistant` and `multi-tenant-host`; advances `external-security-review` (6.7). No new item.

## Capabilities

### Modified Capabilities

- `in-app-assistant`: "Assistant turn route" states that the server-wide limit is host-wide in host mode.

## Impact

- `internal/assistant/service.go` (`Slots`, `NewSlots`, `Service.UseSlots`); `services.Hosted.AssistantSlots`; the host builds one `Slots` and hands it to every tenant; `internal/httpapi/assistant.go` uses it.
- Tests: `TestSharedSlotsAcrossServices` (`internal/assistant`), `TestAssistantConcurrencyIsHostWide` (`internal/host`).
- Docs: `docs/security/threat-model.md`, `docs/api.md`, `docs/self-hosting/docker.md`, the host-mode docs; CHANGELOG `### Security`.
