# Spec Delta

## ADDED Requirements

### Requirement: Token limit for models that refuse max_tokens
When a provider refuses a Chat Completions request that carries a token limit with HTTP 400 and an error whose `param` is `max_tokens` and whose `code` is `unsupported_parameter`, the server and the on-device assistant SHALL send the same request once more with the limit as `max_completion_tokens` and without `max_tokens`, and SHALL keep that form for the rest of the turn or connection test. Before such a refusal they SHALL send the limit to Google Gemini and compatible endpoints as `max_tokens`, as today. They SHALL NOT ask again for any other 400, such as one with `code` `invalid_value` for a limit that is too large, and SHALL report a refusal of the retried request as any other refused request. This retry and the `reasoning_effort` retry each happen at most once per turn, in either order, and neither uses up a retry of a rate-limited or failed request. It needs no setting and reads no data, so it has no offline or convergence behaviour of its own.

#### Scenario: Azure OpenAI's v1 endpoint with a reasoning model
- **WHEN** the owner tests a compatible endpoint with base URL `https://<resource>.openai.azure.com/openai/v1` and model `gpt-6.2-sol`, and the endpoint answers 400 `{"error":{"type":"invalid_request_error","param":"max_tokens","code":"unsupported_parameter"}}` and then 400 naming `reasoning_effort`
- **THEN** the third request carries `max_completion_tokens` and `reasoning_effort: "none"`, and **Test connection** passes

#### Scenario: Other servers are unchanged
- **WHEN** a turn runs on a compatible endpoint that accepts `max_tokens`
- **THEN** every request carries `max_tokens` and none carries `max_completion_tokens`

#### Scenario: Refused again
- **WHEN** the retried request is refused with the same 400
- **THEN** no further request is sent for it and the turn ends with `provider_error`, status 400, as for any refused request

#### Scenario: On the device
- **WHEN** an encrypted account's device set up with a compatible endpoint runs a turn and the endpoint answers the same 400
- **THEN** the device sends the request again with `max_completion_tokens` and the turn is answered
