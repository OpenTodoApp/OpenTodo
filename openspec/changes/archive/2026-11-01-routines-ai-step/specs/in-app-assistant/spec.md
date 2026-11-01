## ADDED Requirements

### Requirement: Assistant consent covers routines
The consent disclosure, for the server's assistant and for the on-device assistant, SHALL say that routines with AI steps send their inputs to the provider on schedule or on events, while the user may not be present, and which fields may be sent. Accepting it SHALL record consent for routines with the disclosure's version through `PUT /api/v1/me/assistant`; without it AI steps SHALL be unavailable with reason `ai_no_consent`, while the user's other assistant use keeps its existing consent. Routine AI calls SHALL use the assistant's provider and key rules, model response checks and prompt-injection defences, SHALL offer the model no tools, and SHALL be recorded in the user's usage tagged `routine` and counted toward the monthly allowance.

#### Scenario: Existing consent
- **WHEN** a user who consented before this change adds an Ask AI step
- **THEN** the step reads "Not available: accept the assistant's updated terms for routines" with a link, and chats keep working

#### Scenario: Accepting
- **WHEN** the user accepts the updated disclosure
- **THEN** `GET /api/v1/me/assistant` reports routines consent with the version, and the step becomes available

#### Scenario: Consent route requires authentication
- **WHEN** a request without credentials sends routines consent to `PUT /api/v1/me/assistant`
- **THEN** the response is 401 `unauthorized`
