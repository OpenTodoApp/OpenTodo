## ADDED Requirements

### Requirement: Browser-compatible User-Agent fallback
Subscription fetches SHALL identify as `OpenTodo/<version>` in the User-Agent header. When a feed answers 400, 403 or 406 to that, the server SHALL send the same request once more with a fixed browser-compatible User-Agent, and the second answer SHALL be the outcome of the fetch. No other status and no transport error SHALL be retried, and a fetch SHALL never send more than two requests for this reason. When the retry succeeds, the server SHALL remember it for that subscription and send the browser-compatible User-Agent first on later fetches, until the subscription's address changes. This state is kept on the server with the subscription, never synced and never returned by the API; devices are unaffected, online or offline, and there is nothing to converge.

#### Scenario: Exchange on-premises refuses the OpenTodo User-Agent
- **WHEN** a feed answers 400 to `OpenTodo/<version>` and 200 to the browser-compatible User-Agent
- **THEN** the first fetch succeeds after one retry, and the next fetch sends the browser-compatible User-Agent directly

#### Scenario: A feed that refuses everything
- **WHEN** a feed answers 400 to every request
- **THEN** the fetch sends exactly two requests and fails with `http_400`, and nothing is remembered

#### Scenario: Not found is not retried
- **WHEN** a feed answers 404
- **THEN** the fetch sends one request and fails with `http_404`

#### Scenario: A new address starts over
- **WHEN** a subscription that uses the browser-compatible User-Agent gets a new address
- **THEN** its next fetch identifies as `OpenTodo/<version>` first
