## ADDED Requirements

### Requirement: A refused test request says so
When the server refuses a settings form's connection-test request itself, with 405 `method_not_allowed` or 404 `not_found`, the form SHALL say that the test request was rejected before any provider was asked, show the status and the server's message (which names the method and path it received), and point to a reverse proxy or redirect as the likely cause. Any other failure SHALL read as before.

#### Scenario: A proxy changed the request
- **WHEN** the owner tests Google Gemini and the request reaches the server as a `GET`
- **THEN** the form reads "The server rejected the test request (405: GET is not allowed on /api/v1/settings/assistant/test; use POST). A reverse proxy or a redirect may have changed it on the way; the provider was not asked."

#### Scenario: Provider refusal unchanged
- **WHEN** the test reaches the provider and the provider refuses the key
- **THEN** the form shows the provider's refusal as before, not the rejected-request sentence
