## ADDED Requirements

### Requirement: Owner connection test
`POST /api/v1/settings/assistant/test` SHALL test the owner's on-screen provider settings, saved or not. The request names the provider and MAY carry `model`, `base_url`, `key` and `allow_private_endpoint`; a field present is used as given, a field absent falls back to its saved value. "Allow this provider" SHALL NOT affect the test. The route SHALL be owner-only and send one minimal request with one tool to that provider only.

#### Scenario: Unsaved model and key
- **WHEN** the owner, with nothing saved for OpenAI, types model `gpt-5.4-mini-2026-03-17` and a key and selects Test connection without saving
- **THEN** the only outbound request goes to the OpenAI host with that model and key, and the response is 200 with the provider's result

#### Scenario: Saved key with an edited model
- **WHEN** a key is saved for Anthropic and the owner changes the model on screen without typing a key, then tests
- **THEN** the test uses the on-screen model with the saved key

#### Scenario: Replacement key not yet saved
- **WHEN** a key is saved for OpenAI and the owner types a different key and tests
- **THEN** the test uses the typed key

#### Scenario: Saved settings only
- **WHEN** a client sends only `{provider}`
- **THEN** the saved settings and key are tested, as before this change

#### Scenario: Member, token or anonymous
- **WHEN** a member calls the route, or it is called with an API token or without credentials
- **THEN** the response is 403 `forbidden`, 403 `session_required` or 401 `unauthorized`, and no outbound request is made

### Requirement: Test keys and checks
In a connection test, `key` SHALL follow the save semantics: absent uses the saved key, an empty string means no key, a value is used for that request only. The merged values SHALL pass the same checks as a save, including the private-address check with the on-screen private-endpoint value, before any outbound request; a failure SHALL be reported naming the field (400 `invalid_input`, or code `private_target` for a private address). A test SHALL never save, audit, log or return a key.

#### Scenario: Key removed on screen
- **WHEN** the owner selects "Remove saved key" for Gemini and tests before saving
- **THEN** the response is 200 with `ok: false` and code `no_key`, and no outbound request is made

#### Scenario: Empty model
- **WHEN** a test request carries `model: ""`
- **THEN** the response is 400 `invalid_input` naming the model and no outbound request is made

#### Scenario: Private endpoint switch not yet saved
- **WHEN** the owner types a compatible base URL resolving to `192.168.1.20`, turns on "Allow private endpoints" without saving, and tests
- **THEN** the test reaches that address; with the switch off on screen the result has code `private_target` and no outbound request is made

#### Scenario: Nothing saved or logged
- **WHEN** the owner or a member tests with a typed key
- **THEN** the saved settings and keys are unchanged, no `settings.changed` event is audited, and neither the response nor the server log contains the key

### Requirement: Connection test in the settings forms
The owner's and the member's settings forms SHALL send their on-screen values when testing. A form SHALL not send a test while the model is empty, SHALL clear a shown result when a tested value changes, and SHALL say when a passing test covered unsaved values. Tests need a connection; offline the button SHALL be unavailable and nothing SHALL be queued.

#### Scenario: Empty model in the form
- **WHEN** the model field is empty
- **THEN** the form shows "Enter a model id to test" and sends nothing

#### Scenario: Stale result cleared
- **WHEN** a test result is shown and the person edits that provider's model, base URL, key or the private endpoints switch
- **THEN** the result disappears until the next test

#### Scenario: Passing test of unsaved values
- **WHEN** a test of values that differ from the saved ones succeeds
- **THEN** the form shows "Connection works. Save to use these settings."

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** Test connection is unavailable with a note that it needs a connection, and nothing is queued

## MODIFIED Requirements

### Requirement: Member connection test
`POST /api/v1/me/assistant/test` SHALL test the member's on-screen own provider, model and key, saved or not; absent fields fall back to the saved ones, and a saved key SHALL be used only for the provider it was saved for. The provider SHALL be Anthropic, OpenAI or Gemini. It SHALL require a session, the assistant on and member keys allowed, but not a saved own provider; SHALL allow at most 5 tests per account in 10 minutes; and SHALL reach only the chosen built-in host.

#### Scenario: Successful test
- **WHEN** a member with their own OpenAI provider and key selects Test connection
- **THEN** the response is 200 `{ok: true}` and the only outbound request went to the OpenAI host with their key

#### Scenario: Test before saving
- **WHEN** a member who has never saved an own provider selects Gemini, types a model and a key, and selects Test connection
- **THEN** the only outbound request goes to the Gemini host with that model and key, and their saved settings are unchanged afterwards

#### Scenario: Saved key for another provider
- **WHEN** a member's key is saved for OpenAI and they switch the form to Anthropic without typing a key and test
- **THEN** the response is 200 with `ok: false` and code `no_key`, and no outbound request is made

#### Scenario: Rejected key
- **WHEN** the provider rejects the member's key
- **THEN** the response is 200 with `ok: false`, code `provider_auth` and a message about their own key

#### Scenario: Provider not offered to members
- **WHEN** a member sends `provider: "compatible"`
- **THEN** the response is 400 `invalid_input` and no outbound request is made

#### Scenario: Token or anonymous
- **WHEN** the route is called with an API token or without credentials
- **THEN** the response is 403 `session_required` or 401 `unauthorized` and no provider request is made

#### Scenario: Too many tests
- **WHEN** a member runs a sixth test within 10 minutes
- **THEN** the response is 429 `rate_limited` with `Retry-After` and no provider request is made
