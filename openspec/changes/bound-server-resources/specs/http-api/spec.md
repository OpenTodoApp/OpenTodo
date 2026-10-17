## ADDED Requirements

### Requirement: Strict JSON request bodies
A JSON request body SHALL be exactly one JSON value; anything after it but white space SHALL be refused with 400 `bad_request`. A field the route does not define SHALL be refused with 400 `bad_request` naming it, except on the sync exchange, the push subscription and passkey credentials, whose bodies may carry more. A refused body writes no op, so devices are unaffected. Without credentials a protected route still answers 401.

#### Scenario: Unknown field
- **WHEN** a client posts `{"email": "…", "password": "…", "remember": true}` to `/api/v1/auth/login`
- **THEN** the response is 400 `bad_request` with a message naming `remember` and nobody is signed in

#### Scenario: Data after the value
- **WHEN** a body holds a JSON object followed by another value
- **THEN** the response is 400 `bad_request`

#### Scenario: Newer client syncs
- **WHEN** a client sends a sync exchange whose ops carry a property this server does not know
- **THEN** the exchange is processed as before

#### Scenario: Without credentials
- **WHEN** a body with unknown fields is sent to a protected route without a session or token
- **THEN** the response is 401 `unauthorized`

### Requirement: Body size and error messages
A JSON body over the route's size limit (4 MB unless the route sets a smaller one) SHALL be refused with 413 `too_large`. Error messages about a body SHALL be the server's own plain text, never the decoder's internal wording. Nothing is written, so devices are unaffected.

#### Scenario: Body too large
- **WHEN** a JSON body is larger than the route's limit
- **THEN** the response is 413 `too_large`

#### Scenario: Wrong type
- **WHEN** a field has the wrong JSON type
- **THEN** the response is 400 `bad_request` saying which field and what type it must be, without the server's internal type names
