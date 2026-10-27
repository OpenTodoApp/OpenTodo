## ADDED Requirements

### Requirement: Wrong method and unknown routes
A request under `/api/` to a path some route serves, with a method none of its routes serve, SHALL answer 405 with code `method_not_allowed`, an `Allow` header listing the methods the path serves, and a message naming the method, the path and those methods. A path no route serves SHALL answer 404 `not_found` with a message naming the method and path. Neither SHALL repeat the query string or a control character, and the path SHALL be cut when long.

#### Scenario: A redirected POST
- **WHEN** a reverse proxy turns the owner's `POST /api/v1/settings/assistant/test` into a `GET`
- **THEN** the response is 405 with `Allow: POST` and the message "GET is not allowed on /api/v1/settings/assistant/test; use POST"

#### Scenario: Not signed in
- **WHEN** a client without a session or token sends `GET /api/v1/settings/assistant/test`
- **THEN** it also gets the 405, and the same request with `POST` still gets 401 `unauthorized` from the route's policy

#### Scenario: Unknown path
- **WHEN** a client sends `GET /api/v2/tasks?token=secret`
- **THEN** the response is 404 `not_found` with the message "unknown API route: GET /api/v2/tasks" and no `Allow` header

#### Scenario: Switched-off feature
- **WHEN** push is turned off and a client sends `POST /api/v1/push/subscriptions`
- **THEN** the response is 404, not 405, because the generic collection routes count only for a real collection
