## MODIFIED Requirements

### Requirement: Map proxy
The server SHALL serve maps through its own routes for the map style, tiles, fonts, sprites, address search and reverse search, each fetching from the configured provider, caching tiles on disk under the data directory within a size cap, sending an identifying User-Agent, and forwarding no cookie, account information or client address. Every map route SHALL require a signed-in session or a full token, SHALL be on the demo deny list, and SHALL answer 404 `maps_disabled` when maps are off for the server. Search SHALL be rate limited per user. The map SHALL show the provider's attribution. On a self-hosted server only the hosts of the configured style and search URLs MAY be on a private network; every other address, including tile, font and sprite addresses named by the provider's style and redirect targets, SHALL pass the outbound deny list. On a hosted tenant the map proxy SHALL reach no private network address. Link-local and cloud metadata addresses SHALL never be reached.

#### Scenario: Signed-out request
- **WHEN** a request without credentials asks for a map tile
- **THEN** the response is 401 `unauthorized` and nothing is fetched from the provider

#### Scenario: Maps turned off by the owner
- **WHEN** the owner has turned maps off and a signed-in user's device asks for the style or a search
- **THEN** the response is 404 `maps_disabled`, and no request leaves the server

#### Scenario: Provider unreachable
- **WHEN** the tile provider does not answer within the timeout
- **THEN** the route answers 502 `maps_unavailable`, the panel shows the location without a map and keeps "Open in maps", and a tile already in the cache is still served

#### Scenario: Viewer's address hidden
- **WHEN** a user's browser loads a map and the provider's incoming request is inspected
- **THEN** it comes from the OpenTodo server's address, carries the server's User-Agent, and carries no cookie, token or user address

#### Scenario: Search rate limit
- **WHEN** one user sends more searches per minute than the limit
- **THEN** further searches answer 429 `rate_limited` until the minute passes, and other users are unaffected

#### Scenario: Local provider, foreign local address in its style
- **WHEN** the owner's style URL is on the local network and the style names tiles on another local host
- **THEN** the style and search work, and a tile request answers 502 `maps_unavailable` without connecting to the other host

#### Scenario: Hosted tenant
- **WHEN** a hosted tenant's owner sets a provider on a private network address and a user loads the map
- **THEN** the route answers 502 `maps_unavailable` and no connection is made to that address
