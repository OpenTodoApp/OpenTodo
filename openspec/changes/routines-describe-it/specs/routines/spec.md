## ADDED Requirements

### Requirement: Describe a routine
The Routines page SHALL offer Describe it only when the user can make an assistant turn: on a plaintext account the assistant is on and the user has consented for the provider in use; on an encrypted account the on-device assistant is set up and consented on this device. Describe it SHALL take one sentence of at most 500 characters and SHALL produce a routine draft through the assistant: the model receives the catalogue of steps available to the user as the schema of one tool `draft_routine` and the names and ids of the user's projects, sections, labels, views and webhooks marked as untrusted, may call no other tool, and its draft SHALL be type-checked, with one retry carrying the errors. The draft SHALL open in the editor with "Drafted by AI: check each step, then Save" and its errors on their cards. Describe it SHALL never save, enable, test or run a routine. It SHALL use the provider, consent, allowance and usage of the assistant; on an encrypted account it SHALL run on the device through the on-device assistant, and nothing SHALL reach the OpenTodo server. Offline, Describe it SHALL say it needs a connection to the provider; nothing is queued.

#### Scenario: No provider
- **WHEN** the owner has not turned the assistant on and the user opens the Routines page
- **THEN** the page offers New routine and Start from a starter only

#### Scenario: A sentence becomes a draft
- **WHEN** the user describes "every Friday at five, make tasks in Errands from my Groceries note"
- **THEN** the editor opens a draft with a Friday 17:00 trigger, Get note text of Groceries, Split into lines and Create tasks in Errands, unsaved, with the banner

#### Scenario: Nothing is saved
- **WHEN** the user closes the editor after a draft without saving
- **THEN** no routine exists and nothing ran

#### Scenario: Encrypted account
- **WHEN** a user of an encrypted account with the on-device assistant describes a routine
- **THEN** the request goes from the device to its provider, the OpenTodo server receives no request for it, and the draft opens in the editor

#### Scenario: Only available steps
- **WHEN** outgoing email is not set up and the user describes "email me my week every Friday"
- **THEN** the draft uses Notify me or says that email is not available, and holds no Email me step

### Requirement: Describe it route
`POST /api/v1/assistant/routine-draft` with `{text}` SHALL require a session (bearer tokens get 403 `session_required`), a configured assistant and the user's consent (403 `consent_required`), SHALL refuse text over 500 characters with 413 `too_large`, SHALL answer 409 `turn_in_progress` while the user has a turn running, 429 `assistant_quota` at the monthly cap and 429 `rate_limited` after 10 drafts in an hour, and SHALL answer `{draft, errors, warnings, usage}` without writing anything. It SHALL be refused on a demo instance.

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls the route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Token refused
- **WHEN** a script calls the route with a `full` API token
- **THEN** the response is 403 `session_required` and no provider request is made

#### Scenario: Cap reached
- **WHEN** a user at the monthly cap asks for a draft
- **THEN** the response is 429 `assistant_quota` naming the reset date and no provider request is made
