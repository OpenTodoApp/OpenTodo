# Proposal

## Why

"Test connection" in the assistant settings tests what was saved last, not what is on the screen. An owner who types a model id and a key and presses Test before Save gets "Provider: enter a model id first" while the model id is plainly in the field, or a passing test for an old key they just replaced. The browser sends only the provider name, and the server reads the saved settings. Members' own provider has the same flaw: their Test button only appears once a provider is saved, and it tests the saved model and key, not the edits in front of them. The point of a test is to check settings before trusting them, so it has to test exactly what the person sees.

## What Changes

- **The owner's "Test connection" tests the values on screen**: the provider's model, base URL, key and the "Allow private endpoints" switch as they are in the form, saved or not. A field left untouched falls back to its saved value, so a saved key is used until a new one is typed, and "Remove saved key" tests without one.
- **The member's "Test connection" tests their form the same way**: the chosen provider, model and key on screen, available as soon as "Use my own provider" is selected, without saving first.
- **Testing never saves.** Nothing is written, audited or kept from a test; a key typed for a test is used for that one request only and never logged or echoed.
- **The same checks as saving apply to a test**: an empty model, a missing base URL or a private address without the switch are refused with the field named, before any request leaves the server. The form says "Enter a model id to test" instead of sending an empty model.
- **A result belongs to the values it tested**: editing any of them clears the shown result, and a passing test of unsaved values says "Connection works. Save to use these settings."
- The test routes accept the on-screen values as optional fields. An empty body tests the saved settings as today, so existing callers keep working. Not **BREAKING**: no new environment variable, no op log change.

## Out of scope

- Rate limiting the owner's test. The owner already controls the server and its keys; the member limit (5 tests in 10 minutes) stays as it is.
- Testing a provider that is not configured at all on the server for members (members still choose only Anthropic, OpenAI or Gemini).
- Saving automatically after a passing test.
- Any change to how turns pick a provider, or to the settings that are saved.

ROADMAP: fixes the shipped item 3 of the AI section, the conversational assistant (`in-app-assistant`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `in-app-assistant`: adds an "Owner connection test" requirement (the owner's test uses the on-screen values) and changes "Member connection test" so a member tests their unsaved provider, model and key.

## Impact

- **Server**: `internal/httpapi/assistant.go` (`handleTestAssistant`, `handleTestMyAssistant` read optional draft fields), `internal/assistant/service.go` (`TestConnection` and `TestMember` take the draft merged over the saved settings, validated like a save).
- **Web**: `web/src/lib/api.ts` (`testAssistant`, `testMyAssistant` send the draft), `web/src/app/assistant/AssistantSettings.tsx` (send the form's values, clear stale results, "Save to use" note, member Test available before saving, empty-model hint).
- **Docs**: `docs/assistant.md` and `docs/api.md` describe what Test checks and the request fields.
- **Demo instance**: both routes are already on the deny list in `internal/httpapi/demo.go`; unchanged.
- No dependencies, no migration, no change to the op log or the secrets file format.
