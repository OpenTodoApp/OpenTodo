# Member's own assistant provider

## Why

The in-app assistant lets the server owner choose one provider and optionally "Let members bring their own key". Today a member's key only works for the owner's provider, and the owner's monthly token cap also limits turns the member pays for with their own key. A member who has an OpenAI or Gemini account cannot use it when the owner chose Anthropic, and a member paying with their own key is still stopped at the owner's allowance.

## What Changes

- While the owner allows member keys, each member can choose **their own provider** in **Settings → AI → Assistant**: Anthropic, OpenAI or Google Gemini, a model, and their key. The **compatible endpoint is never offered to members**: a URL a member types would let any account make the server connect to a host of their choosing.
- Model ids: Anthropic from the same offered list as the owner's picker; OpenAI and Gemini as free text, at most 100 characters of `A-Za-z0-9._:-`.
- "Use the server's assistant" keeps today's behaviour (owner's provider with the operator's key, or a key the member stored for the owner's provider before this change).
- **Resolution per turn:** member keys allowed, a provider chosen and its key set → the member's provider, model and key (built-in host, fixed client). Otherwise the owner's provider. When the owner stops allowing member keys, the choice is kept but ignored.
- **Consent** names the provider a turn actually uses; switching to another provider asks again (`provider_changed`, `consent_required`). For the member's own provider the disclosure says the request goes from this server to that provider with their key.
- **Cap:** new owner setting `cap_member_keys` (default off). Off, turns on a member's own key are not counted against or blocked by `monthly_token_cap_per_user`; they are still recorded and shown as "your key". On, as before. One turn per person and the server-wide limit apply to every turn.
- The owner sees how many people use their own provider and key. A member can **Test connection** of their own provider (signed-in session, 5 tests per 10 minutes).
- API: `GET/PUT /api/v1/me/assistant` gain `own_provider`, `own_model` and new status fields; `POST /api/v1/me/assistant/test`; `cap_member_keys` and `own_key_members` on `/api/v1/settings/assistant`; usage gains `counted_tokens` and `own_key`. All additive.

## Out of scope

- Members using the compatible endpoint or any URL they enter.
- Restricting members to the providers the owner enabled (the owner's single switch "Let members bring their own key" governs it; see design D2).
- Per-member caps, or a separate cap for own-key turns.
- Device-direct requests (the browser calling the provider itself); keys stay on the server.

## ROADMAP

Advances the shipped row 3 "Conversational assistant in the app, with your own model key" (`in-app-assistant`): a member's own key now works with the provider of their choice. No new row.

## Impact

- **Specs:** `in-app-assistant` (two requirements added, three modified).
- **Code:** `internal/assistant` (member choice, per-turn resolution, own-key usage, member connection test), `internal/httpapi/assistant.go` (routes and turn), migration `0028_assistant_member_provider.sql`, `web/src/app/assistant/AssistantSettings.tsx` and `AssistantConsent.tsx`, `web/src/lib/assistant*.ts`, `api.ts`; tests.
- **Docs:** `docs/assistant.md`, `docs/api.md`, CHANGELOG.
- Nothing **BREAKING**: no environment variable, no op log change, no new dependency. Behaviour change for existing servers that allow member keys: turns on a member's own key stop counting toward the cap until the owner turns on `cap_member_keys`.
