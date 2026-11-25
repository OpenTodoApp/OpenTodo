# Spec Delta

## ADDED Requirements

### Requirement: Tools with models that call them only without reasoning
When a provider refuses a Chat Completions request that carries tools with HTTP 400 and an error whose `param` is `reasoning_effort`, the server and the on-device assistant SHALL send the same request once more with `reasoning_effort: "none"`, and SHALL keep that field for the rest of the turn or connection test. They SHALL NOT send `reasoning_effort` before such a refusal, SHALL NOT ask again for a request without tools or for any other 400, and SHALL report a refusal of the retried request as any other refused request. This applies to OpenAI, Google Gemini and compatible endpoints alike, needs no setting, and reads no data, so it has no offline or convergence behaviour of its own.

#### Scenario: GPT-6 Luna on the OpenAI provider
- **WHEN** a turn runs on OpenAI with model `gpt-6-luna` and OpenAI answers the first request with 400 `{"error":{"type":"invalid_request_error","param":"reasoning_effort"}}`
- **THEN** the request is sent again with `reasoning_effort: "none"`, the turn is answered, and every later round of the turn carries `reasoning_effort: "none"`

#### Scenario: Other models are unchanged
- **WHEN** a turn runs on a model that accepts tools as today
- **THEN** no request carries `reasoning_effort`

#### Scenario: Refused again
- **WHEN** the retried request is refused with the same 400
- **THEN** no third request is sent and the turn ends with `provider_error`, status 400, as for any refused request

#### Scenario: On the device
- **WHEN** an encrypted account's device set up with OpenAI and `gpt-6-luna` runs a turn and OpenAI answers the same 400
- **THEN** the device sends the request again with `reasoning_effort: "none"` and the turn is answered
