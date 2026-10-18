## ADDED Requirements

### Requirement: A refused request from another host of the server is explained

When `OPENTODO_BASE_URL` is set and a browser request is refused because the page was opened at a host other than the base URL's, the server SHALL log one warning per such host, naming the host and the base URL, for at most 32 distinct hosts. The sign-in screen SHALL show the host the server is set up for instead of asking for a reload, when auth/status reports that host and it differs from the page's.

#### Scenario: Demo opened at its new domain with the old base URL
- **WHEN** the base URL is `https://opentodo-demo.pixari.dev` and a visitor on `https://demo.open-todo.app` presses "Try the demo" three times
- **THEN** each request is refused with 403 `bad_origin`, the log has exactly one warning naming `demo.open-todo.app` and the base URL, and the screen says the server is set up for `opentodo-demo.pixari.dev`

#### Scenario: A cross-site page is not reported
- **WHEN** a request to the same host carries an `Origin` of another site
- **THEN** it is refused as before and nothing is logged for it

#### Scenario: Made-up hosts cannot flood the log
- **WHEN** requests arrive for more than 32 different wrong hosts
- **THEN** warnings stop after 32 hosts
