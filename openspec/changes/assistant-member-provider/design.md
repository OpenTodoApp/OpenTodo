# Design: member's own assistant provider

## Context

`in-app-assistant` stores the owner's settings under the settings key `assistant` and keys in `<data>/secrets/assistant.json`: `operator:<provider>` for the owner and `user:<user-id>:<provider>` for a member's own key. `Store.KeyFor` picked the member's key for the owner's default provider when `allow_member_keys` was on; the turn always used `default_provider`, its model, and counted every token against `monthly_token_cap_per_user`. Consent (`assistant_consent`) records the provider the disclosure named.

## Goals / Non-goals

Goals: a member who may bring their own key can pick Anthropic, OpenAI or Gemini and a model for it; turns on a member's key are not held to the owner's cap unless the owner wants that; consent always names the provider that receives the data; no new way for members to make the server connect to an arbitrary host. Non-goals: members on compatible endpoints, per-member caps, browser-direct calls.

## Decisions

### D1. Data model

- New table `assistant_member_provider(user_id PK → users ON DELETE CASCADE, provider, model, updated_at)`. No row means "use the server's assistant". Provider and model are not secret; they are server state, not ops (never synced or exported; part of the database snapshot in backups like the rest of the assistant tables).
- The member's key stays in the secrets file under the existing name `UserKey(userID, provider)`. A key stored before this change (for the owner's provider, no row) keeps working exactly as before. Account deletion already removes every `user:<id>:*` key; the row cascades.
- New table `assistant_usage_own_key(user_id, month, input_tokens, output_tokens, turns)`: the part of `assistant_usage` (which still counts every turn) that ran on the member's own key. A separate table keeps both migrations idempotent (no `ALTER TABLE`) and leaves the existing usage rows untouched.
- Owner setting `cap_member_keys` (bool, default false) in the existing settings JSON. Absent in stored settings reads as false.
- Migration `0028_assistant_member_provider.sql`, every statement `IF NOT EXISTS` so it can be renumbered at merge time.

### D2. Which providers a member may choose

Anthropic, OpenAI and Google Gemini only: their hosts are built in (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`) and reached through the same fixed client as the owner's turns (TLS, no redirects, no settings-controlled host). The **compatible endpoint is refused** (`400 invalid_input` on `own_provider`) even when the owner uses it: a base URL is a destination the server connects to, and letting any account type one would turn the assistant into a server-side request forwarder (SSRF toward the operator's network or metadata services, or simply traffic from the server's address to hosts the owner never approved). The owner's private-endpoint switch is about the owner's own model server and is never applied to members.

Member choices are **not** limited to the providers the owner ticked "Allow this provider" for. Those switches describe what the owner configured with the owner's key; the owner's separate "Let members bring their own key" switch is the decision that members may send their own data to these three built-in providers with their own accounts. Limiting members to the owner's enabled providers would force an owner who wants to allow, say, Gemini for members to "enable" it without a key, which then also makes it selectable as the provider everyone uses. Recorded as an open question below.

Model ids: Anthropic from `AnthropicModels` (the list the owner's picker offers; members cannot type another id, so nothing unknown is sent on the Anthropic SDK path); OpenAI and Gemini as free text of 1–100 characters from `[A-Za-z0-9._:-]` (covers ids such as `gpt-4.1-mini`, `ft:gpt-4o-mini:org:custom:id`, `gemini-2.5-flash`; refuses whitespace, `/` and anything that could alter a URL or header). The model id only goes into the JSON request body.

### D3. Resolution per turn

`Store.Resolve(userID, settings)` returns a `Route` (provider, model, own, member, unexported key):

| Owner allows member keys | Member chose a provider | Key for it set | Turn uses |
|---|---|---|---|
| no | any | any | owner's provider with the operator key (choice kept, ignored) |
| yes | yes | yes | member's provider, model and key (`own`, `member`) |
| yes | yes | no | owner's provider (as below); the API never stores a choice without its key, see D5 |
| yes | no | key for owner's provider | owner's provider with the member's key (`own`, legacy) |
| yes | no | no | owner's provider with the operator key |

The assistant being off answers 404 before any of this (unchanged). `Route` implements `String`, `GoString` and `slog.LogValuer` without the key, and has no JSON tags for it, so it cannot leak through logs or responses.

### D4. Consent

Consent stays one row per user with the provider name. `consented` and the turn check use the provider of the resolved route, so switching from the owner's provider to your own (or between your own providers, or when the owner stops allowing member keys) asks again: `PUT` with the old provider gets 409 `provider_changed`, the turn gets 403 `consent_required`. `GET /api/v1/me/assistant` returns `provider`, `provider_label` and `model` of the route, so existing clients that echo `provider` keep working; the owner's provider moves to `server_provider*`. The disclosure for `source: "own"` says the request goes from this server to that provider with the member's own key.

Same provider name, different key (the owner's OpenAI vs. your own OpenAI) does not ask again: the recipient of the data is the same company and the field list is unchanged. The disclosure text still says which key is used.

### D5. API (`/api/v1/me/assistant`, additive)

`PUT` accepts `own_provider` (`anthropic|openai|gemini`, or `""` for the server's assistant), `own_model`, and the existing `own_key` and `consent`/`provider`:

- Choosing a provider or storing a key needs `allow_member_keys` (403 `forbidden`); clearing the choice or removing a key never does, so a member can always take their key back.
- A choice must come with a key (in the request or already stored for that provider): 400 `invalid_input` on `own_key` otherwise. Removing the key of the chosen provider (`own_key: ""`) goes back to the server's assistant. So a stored choice always has a key.
- Leaving a chosen provider (for another one or for the server's assistant) deletes the key stored for it. A key stored for the owner's provider without a choice (legacy) is left alone.
- `own_key` alone sets the key of the chosen provider when there is one, otherwise of the owner's provider (as before).
- Validation happens before anything is written; a refused request stores nothing. Consent in the same request is checked against the provider in effect after the request.
- Audit: `assistant.own_provider` (`server` ↔ provider name), `assistant.own_model`, and the existing `assistant.own_key.<provider>` (`unset`/`set`).
- Sessions and `full` tokens may call `PUT` (unchanged); `read` and `agent` tokens are refused.

`POST /api/v1/me/assistant/test`: signed-in sessions only (403 `session_required` for tokens), 409 `assistant_disabled` while off, 403 `forbidden` without member keys, 409 `no_own_provider` when the member's route is not their own provider, then 5 tests per account per 10 minutes (429 `rate_limited` with `Retry-After`). It reuses the owner's connection test (one tiny request with one tool, `no_tool_support` detection) on the member's route only, so it can only reach the three built-in hosts. A rejected key reports "the provider rejected your API key".

### D6. Cap

`capped = monthly_token_cap_per_user > 0 && (!route.own || cap_member_keys)`. The 429 `assistant_quota` check uses `Usage.Counted(cap_member_keys)`: all tokens when member keys are counted, otherwise all tokens minus the own-key tokens. Every turn is still added to `assistant_usage`; own-key turns also to `assistant_usage_own_key`. The usage route adds `counted_tokens`, `cap_member_keys` and `own_key {input_tokens, output_tokens, total_tokens, turns}`; the turn's `usage` event adds `own_key` and sends `cap: 0` when the cap does not apply to that turn, so the answer shows "1,240 tokens · your key". The legacy own key for the owner's provider counts as the member's own key too (the member pays for it). One turn per person and the server-wide limit of 8 apply to every turn.

### D7. UI

Settings → AI → Assistant, member part, when member keys are allowed: a "Which assistant you use" fieldset with two radios ("The server's assistant" naming the owner's provider and model; "My own provider and key"). Own: provider select (three options), model select for Anthropic or a text field (max 100, same pattern checked before sending), password field for the key (never prefilled; "Your key is saved; type to replace it"), a short disclosure, "Save my provider", "Test connection" once saved. A legacy key for the owner's provider shows "Your key is saved for …" with Remove. When the owner disallows member keys but a choice is kept, a note explains it is not used and offers "Forget my provider and key". Owner part: under "Let members bring their own key", "Count members' own keys toward the monthly limit" and "N people use their own provider and key". The consent panel names the member's provider and hides its own-key field when `source` is `own`.

## Data model impact

Two additive tables and one additive settings field; no op, no entity field, no sync change. Keys stay in the secrets file (never in the database, API responses, logs, exports or backups).

## Size and memory

No dependency. Server: a few hundred lines in `internal/assistant` and `internal/httpapi`. The settings UI is in the lazy assistant settings chunk; the main chunk only gains optional type fields (no runtime code). Measured with `npm run build`: see tasks 4.3.

## Risks / Trade-offs

- [A member sends shared-project content to a provider the owner did not pick] → this was already true for member keys (their key, the owner's provider); now the provider differs too. The disclosure names it; the owner decides with "Let members bring their own key" and can turn it off at any time (choices are then ignored at once). The existing roadmap idea "keep a shared project away from AI assistants" remains the real mitigation.
- [Own-key turns escape the owner's cap] → intended (the member pays); owners who want one limit for everyone turn on `cap_member_keys`. Concurrency limits still bound server load.
- [Existing servers: own-key turns stop counting] → called out in the CHANGELOG.

## Open questions

- Should the owner be able to restrict member providers to a subset (for example "members may use Anthropic only")? Not in this change; the single switch keeps the owner UI simple.
