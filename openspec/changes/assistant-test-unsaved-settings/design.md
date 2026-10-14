# Design

## Context

- The owner's Configure dialog keeps a draft of the settings (`AssistantSettings.tsx`); Save sends it with `PUT /api/v1/settings/assistant`, where `keys` is `map[string]*string` (absent = keep, `""` = remove, value = set).
- "Test connection" sends only `{provider}` (`api.testAssistant`), and `Service.TestConnection` reads the saved `Settings` and the saved key, so unsaved edits are invisible to it. That is the bug: a typed model reads as "enter a model id first".
- The member form has the same shape: `POST /api/v1/me/assistant/test` resolves the saved route (`Store.Resolve`) and refuses with `no_own_provider` until something is saved.
- Specs: `specs/in-app-assistant/spec.md` in this change. Motivation: `proposal.md`.

## Goals / Non-Goals

**Goals:**
- A test checks exactly what is on screen, so its result can be trusted before saving.
- One validation path for save and test, so a test never accepts what a save would refuse, or the reverse.
- Keys stay as secret as today: never stored, logged or echoed because of a test.

**Non-Goals:**
- Auto-saving, or changing what a save does.
- A rate limit for the owner's test.

## Decisions

### D1. The test request carries the on-screen values as optional fields
Owner: `{provider, model?, base_url?, key?, allow_private_endpoint?}`. Member: `{provider?, model?, key?}`. Absent fields fall back to saved values, so an empty body behaves as today and the change is additive. `key` uses the same three states as a save (absent keeps the saved key, `""` means none, a value replaces it for this request).

Alternatives considered:
- **Save, then test:** a test would change live settings that members' turns use at once, and a failed test would leave a broken configuration saved.
- **Disable Test while the form has unsaved changes:** smaller, but it still makes people save untested settings, which is what a test is meant to prevent.

### D2. Merge, then validate like a save
`assistant.MergeDraft(saved ProviderSettings, draft) ProviderSettings` builds the provider settings to test, and the validation `SaveSettings` applies (extracted into one function both call) checks them (model required and well-formed, base URL required for `compatible`, `CheckBaseURL` with the on-screen private switch). For members, `MemberDraft` resolves provider, model and key, and uses the saved key only when the saved provider equals the tested one. Validation failures answer 400 before any outbound request. The member route keeps its limiter and `IsMemberProvider` check, so a member can still reach only the three built-in hosts.

### D3. Keys typed for a test live only in the request
The typed key goes from the request body to the provider client and is dropped when the handler returns. Logging stays as today (provider, ok, code); a test adds no `settings.changed` audit entry. The response shape is unchanged (`{ok, code?, message, status?}`).

### D4. The form owns result freshness
Each provider's result is stored with the values it tested (model, base URL, key-state, private switch); when the form's current values differ, the result is cleared. When the tested values differ from the saved ones and the test passed, the note reads "Connection works. Save to use these settings." An empty model shows "Enter a model id to test" next to the button instead of sending a request. While offline the button is disabled with "Needs a connection", like the other server settings.

### Data model impact
None. No new fields on stored settings or ops, no migration, no change to the secrets file.

### Effect on image size and memory
None measurable: no dependencies; a few small functions and a slightly larger request body.

## Risks / Trade-offs

- **[A member could use the test to check arbitrary keys against a built-in provider]** → Already possible today by saving then testing; the 5-per-10-minutes limit and the built-in host list still bound it.
- **[The owner could probe private addresses through the compatible base URL]** → The owner controls the server already; the private-address check still applies with the on-screen switch, exactly as a save would.
- **[Old clients sending only `{provider}`]** → Keep today's behaviour (saved settings).

## Migration Plan

Ship server and web together; the server accepts both request shapes. Rollback: revert; old clients and the old server are compatible both ways.
