## MODIFIED Requirements

### Requirement: Demo abuse limits
The server SHALL bound demo use: a live-sandbox cap (evict the least recently active sandbox idle for 15 minutes, else the oldest sandbox created more than 15 minutes ago, else 503 `demo_busy`), 5 new sandboxes per client address per hour with IPv6 addresses grouped by `/48` (429), at most twice the live cap of new sandboxes per hour for the whole demo (503 `demo_busy`), per sandbox 600 ops an hour, 5,000 ops and 2 MB of values in total (429 `demo_limit`), fields of 4 KB (notes 32 KB), and above a database size threshold no new sandboxes and no sandbox writes. The client address SHALL be the last forwarded hop not listed in `OPENTODO_TRUSTED_PROXIES`.

#### Scenario: Write budget
- **WHEN** a sandbox sends its 601st op within an hour
- **THEN** the batch is refused with 429 `demo_limit`, nothing is applied and the app shows a notice while keeping its queue

#### Scenario: Creation flood
- **WHEN** one address requests a sixth sandbox within an hour, even with a different forged leading `X-Forwarded-For` entry each time
- **THEN** the request gets 429 and no account is created

#### Scenario: Creation flood from one IPv6 site
- **WHEN** six addresses of the same IPv6 `/48` each request a sandbox within an hour
- **THEN** the sixth request gets 429 and an address outside that `/48` still gets a sandbox

#### Scenario: Behind Cloudflare
- **WHEN** `OPENTODO_TRUSTED_PROXIES=cloudflare` and visitors reach the demo through the same Cloudflare edge
- **THEN** each visitor is counted by its own address (the hop before the edge, or `CF-Connecting-IP` from an edge), not the edge's

#### Scenario: Byte budget
- **WHEN** a sandbox's batch would take its stored values past 2 MB
- **THEN** the batch is refused with 429 `demo_limit` and nothing is applied

#### Scenario: Database full
- **WHEN** the database is above its size threshold and a live sandbox writes
- **THEN** the write is refused with 429 `demo_limit` and nothing is applied

#### Scenario: Busy sandboxes cannot hold the cap
- **WHEN** the live-sandbox cap is reached, every sandbox is active, and one was created more than 15 minutes ago
- **THEN** a new visitor gets a sandbox and the oldest one is deleted; its tab's next request gets 401 `demo_expired`

#### Scenario: Turnover limit
- **WHEN** the demo has created twice its live cap of sandboxes within the hour
- **THEN** new visitors get 503 `demo_busy` until the hour has passed

#### Scenario: Full demo
- **WHEN** the live-sandbox cap is reached and every sandbox was created within the last 15 minutes
- **THEN** new visitors get 503 `demo_busy` with a message to try again later
