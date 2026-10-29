# Spec Delta

## ADDED Requirements

### Requirement: Provider errors are read the same for every Chat Completions provider
For OpenAI, Google Gemini and compatible endpoints, the server and the on-device assistant SHALL classify a failed provider request from its status and its error body. The error body is read as a JSON object or as an array whose first element is one, at most 4 KiB. The error type shown in brackets SHALL be the error's `type`, else its string `code`, else its `status`. A 401, a 403, or a 400 whose error marks an invalid API key SHALL be `provider_auth`. A 404 SHALL be `provider_not_found` with the message "the provider has no such model or endpoint (HTTP 404): check the model id", which for the compatible provider adds "and the base URL (it usually ends in /v1)". 429 and 5xx SHALL keep their codes, and any other status SHALL stay `provider_error`. The provider's own message SHALL only be used to classify: it SHALL never be shown, returned, logged or stored. A connection test SHALL make its second request without tools only after a plain `provider_error` 4xx other than 404. The same cases SHALL give the same code and type on the server and on the device.

#### Scenario: Wrong Gemini key in the owner's test
- **WHEN** the owner tests Google Gemini with an invalid key and Google answers 400 with `[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]`
- **THEN** the response is 200 with `ok: false`, code `provider_auth`, status 400 and the message that the provider rejected the API key; exactly one request went to Google, and the response does not contain Google's message

#### Scenario: Unknown Gemini model
- **WHEN** the owner tests Gemini with a valid key and a model id Google does not serve, and Google answers 404 `NOT_FOUND`
- **THEN** the response is 200 with `ok: false`, code `provider_not_found`, status 404 and "the provider has no such model or endpoint (HTTP 404): check the model id"

#### Scenario: Compatible endpoint without /v1
- **WHEN** the owner tests the compatible provider with base URL `https://openrouter.ai/api` and the endpoint answers 404 with an empty body
- **THEN** the result has code `provider_not_found` and its message also asks to check the base URL, which usually ends in /v1

#### Scenario: Wrong Gemini key during a turn
- **WHEN** a turn runs on the owner's Gemini key and Google answers 400 for an invalid key
- **THEN** the turn ends with error `provider_auth`, the owner is pointed to Settings, and no key appears in the message

#### Scenario: Wrong key on the device
- **WHEN** an encrypted account's device set up with Gemini runs a turn and Google answers 400 for an invalid key
- **THEN** the answer says the provider rejected the key saved on this device, as it does for a 401

#### Scenario: Schema refusal still detects missing tool support
- **WHEN** a compatible endpoint answers the test's request with tools with a plain 400 and accepts the request without tools
- **THEN** the result has code `no_tool_support`, as before

#### Scenario: Same answers on server and device
- **WHEN** the shared error vectors run in the Go tests and the web tests
- **THEN** every case gives the same code and type in both

### Requirement: Compatible base URL without the request path
A compatible base URL whose path ends in `/chat/completions`, with or without a trailing slash, SHALL be trimmed to the part before that path. The trim SHALL apply when the owner saves, when the owner tests, when the server builds the provider for a turn, and on the device for a model-server base URL the user typed. The owner's settings SHALL then return the trimmed value. Requests SHALL go to the trimmed base plus `/chat/completions`, once. The setting lives in the server's settings file and is not synced data, so offline and convergence behaviour are unchanged: a device without a connection cannot test or save.

#### Scenario: Pasted full endpoint
- **WHEN** the owner saves the compatible provider with base URL `https://openrouter.ai/api/v1/chat/completions/`
- **THEN** the saved and returned base URL is `https://openrouter.ai/api/v1`, and a test sends its request to `https://openrouter.ai/api/v1/chat/completions`

#### Scenario: Ordinary base URL untouched
- **WHEN** the owner saves `http://192.168.1.20:11434/v1`
- **THEN** the base URL is stored as typed
