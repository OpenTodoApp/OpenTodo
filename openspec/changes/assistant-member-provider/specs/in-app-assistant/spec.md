# Spec Delta

## ADDED Requirements

### Requirement: Member's own provider
While the owner allows member keys, a user MAY choose their own provider (Anthropic, OpenAI or Google Gemini, never the compatible endpoint), a model and a key through `PUT /api/v1/me/assistant`. Anthropic models SHALL come from the offered list; other model ids SHALL be 1–100 characters of `A-Za-z0-9._:-`. A turn SHALL use that provider, model and key only while member keys are allowed and the key is set, otherwise the owner's provider. The choice is server state, not an op.

#### Scenario: Member uses their own OpenAI key
- **WHEN** the owner uses Anthropic and allows member keys, and a member saves provider `openai`, model `gpt-member-1` and their key, then accepts the disclosure naming OpenAI
- **THEN** the member's turns go to the OpenAI host with their key and model, and the owner's turns still go to Anthropic with the operator key

#### Scenario: Compatible endpoint refused
- **WHEN** a member sends `own_provider: "compatible"` or a base URL
- **THEN** the response is 400 `invalid_input` and nothing is stored

#### Scenario: Invalid model or missing key
- **WHEN** a member sends a model id with a space, over 100 characters, an Anthropic id outside the offered list, or a provider without a key
- **THEN** the response is 400 `invalid_input` naming `own_model` or `own_key` and nothing is stored

#### Scenario: Owner stops allowing member keys
- **WHEN** the owner turns off member keys after a member chose their own provider
- **THEN** the choice is kept but ignored, the member's turns use the owner's provider after a new consent, and choosing a provider or storing a key answers 403 `forbidden`

#### Scenario: Back to the server's assistant
- **WHEN** a member sends `own_provider: ""`
- **THEN** their turns use the owner's provider and the key they stored for the provider they had chosen is deleted

#### Scenario: Earlier own key keeps working
- **WHEN** a member stored a key for the owner's provider before choosing any provider of their own
- **THEN** their turns still use that key with the owner's provider

#### Scenario: Unauthenticated or read token
- **WHEN** a request without credentials, or with a `read` token, sends `own_provider` to `PUT /api/v1/me/assistant`
- **THEN** the response is 401 `unauthorized` or 403 and nothing is stored

### Requirement: Member connection test
`POST /api/v1/me/assistant/test` SHALL send one minimal request with one tool to the member's own provider with their model and key, and report success or the provider's error. It SHALL require a signed-in session, the assistant to be on, member keys to be allowed and the member's own provider to be in effect, and SHALL allow at most 5 tests per account in 10 minutes. It SHALL never reach a host other than the chosen built-in provider.

#### Scenario: Successful test
- **WHEN** a member with their own OpenAI provider and key selects Test connection
- **THEN** the response is 200 `{ok: true}` and the only outbound request went to the OpenAI host with their key

#### Scenario: Rejected key
- **WHEN** the provider rejects the member's key
- **THEN** the response is 200 with `ok: false`, code `provider_auth` and a message about their own key

#### Scenario: Token or anonymous
- **WHEN** the route is called with an API token or without credentials
- **THEN** the response is 403 `session_required` or 401 `unauthorized` and no provider request is made

#### Scenario: Too many tests
- **WHEN** a member runs a sixth test within 10 minutes
- **THEN** the response is 429 `rate_limited` with `Retry-After` and no provider request is made

## MODIFIED Requirements

### Requirement: Outbound requests only to configured providers
The server SHALL contact only the hosts of providers the owner enabled and, while member keys are allowed, the built-in Anthropic, OpenAI or Gemini host a member chose. The compatible base URL SHALL be checked at save time and before every connection after name resolution, refusing loopback, private, link-local and metadata addresses unless the owner allowed private endpoints; connections SHALL use the checked address and SHALL not follow redirects. Members SHALL not set base URLs.

#### Scenario: Private endpoint refused by default
- **WHEN** the owner saves a compatible base URL resolving to `10.0.0.5` without allowing private endpoints
- **THEN** the response is 400 `private_target` explaining the owner setting

#### Scenario: Network audit with the assistant off
- **WHEN** the app is used with the assistant disabled while outbound traffic is inspected
- **THEN** no request goes to any model provider

#### Scenario: Only the chosen provider
- **WHEN** a user with Anthropic configured sends a turn while outbound traffic is inspected
- **THEN** the only outbound request for that turn goes to the Anthropic API host

#### Scenario: Only the member's provider
- **WHEN** a member whose own provider is Gemini sends a turn while outbound traffic is inspected
- **THEN** the only outbound request for that turn goes to the Gemini API host

### Requirement: Per-user consent and own keys
Before a user's first turn, the app SHALL show which provider will receive their task content (for a member's own provider, that it goes with their key) and which fields may be sent (titles, descriptions, project, section and label names, due dates, priorities, completion, comments, member names in shared projects), and SHALL record consent for that provider only through `PUT /api/v1/me/assistant`. If the owner allows it, users MAY store their own key there. Consent is server state, not an op.

#### Scenario: Consent required
- **WHEN** a user who has not consented sends `POST /api/v1/assistant/turn`
- **THEN** the response is 403 `consent_required` and no provider request is made

#### Scenario: Give consent
- **WHEN** the user reads the disclosure naming "Anthropic (Claude)" and accepts
- **THEN** `GET /api/v1/me/assistant` reports `consented: true` with the provider and disclosure version, and the composer is enabled

#### Scenario: Own key not allowed
- **WHEN** a member sends an own key while the owner has not allowed member keys
- **THEN** the response is 403 `forbidden` and nothing is stored

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls `PUT /api/v1/me/assistant`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Provider changed by the owner
- **WHEN** the owner switches the default provider from Anthropic to OpenAI after a user consented
- **THEN** the user's next turn is refused with `consent_required` until they accept a disclosure naming OpenAI

#### Scenario: Member switches provider
- **WHEN** a member who consented for Anthropic chooses their own Gemini provider
- **THEN** `consented` is false, accepting with provider `anthropic` answers 409 `provider_changed`, and the disclosure says the request goes from this server to Google Gemini with their key

### Requirement: Cost controls and usage
The owner SHALL set a monthly per-user token cap (default 500,000; 0 means unlimited) and `cap_member_keys` (default off). Each turn SHALL record input and output tokens, marking own-key turns. A user at the cap SHALL get 429 `assistant_quota` before any provider request; own-key turns SHALL be neither counted nor blocked unless `cap_member_keys` is on. `GET /api/v1/me/assistant/usage` SHALL return month-to-date usage, its counted and own-key parts, and the cap. Usage is server state, not an op.

#### Scenario: Usage shown
- **WHEN** a turn completes
- **THEN** the answer shows its token count and the month's share of the cap, and the usage route reports the new totals

#### Scenario: Cap reached
- **WHEN** a user at their monthly cap sends a turn
- **THEN** the response is 429 `assistant_quota` naming the reset date and no provider request is made

#### Scenario: Own key outside the cap
- **WHEN** a member at the cap sends turns on their own key while `cap_member_keys` is off
- **THEN** the turns are answered, each shows "your key", and the usage route reports them under `own_key` and not in `counted_tokens`

#### Scenario: Owner counts member keys
- **WHEN** the owner turns on `cap_member_keys` and a member whose usage including own-key turns is at the cap sends a turn
- **THEN** the response is 429 `assistant_quota` and no provider request is made

#### Scenario: Unauthenticated usage request
- **WHEN** a request without credentials calls `GET /api/v1/me/assistant/usage`
- **THEN** the response is 401 `unauthorized`
