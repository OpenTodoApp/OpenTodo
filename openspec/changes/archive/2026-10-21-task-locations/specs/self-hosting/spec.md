## MODIFIED Requirements

### Requirement: Security headers
Responses SHALL carry a Content-Security-Policy restricting scripts, connections and frames to the app's own origin, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a same-origin referrer policy, and a `Permissions-Policy` that denies the camera and allows geolocation for the app's own origin only. When `OPENTODO_BASE_URL` is https, every response SHALL also carry `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or `preload`; without an https base URL it SHALL NOT be sent.

#### Scenario: Headers present
- **WHEN** the app shell is requested
- **THEN** the response includes the Content-Security-Policy with `script-src 'self'` and `frame-ancestors 'none'`

#### Scenario: HSTS with an https base URL
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and any route is requested
- **THEN** the response has `Strict-Transport-Security: max-age=31536000`, and a server without a base URL sends no such header

#### Scenario: Geolocation for the app only
- **WHEN** the app shell is requested
- **THEN** the `Permissions-Policy` header allows `geolocation` for `self` and denies `camera`, so the browser can ask the user for their position on the app's own pages and on no embedded page

### Requirement: No telemetry
The server and client SHALL make no network requests to third parties and SHALL collect no usage data, with one exception: the map provider. The only outbound requests the server makes SHALL be to destinations the owner or a user explicitly configured (such as a backup destination or a webhook endpoint) and, while maps are on, to the map provider (OpenStreetMap-based by default, changeable or turned off by the owner, OpenSpec `task-locations`). None of them SHALL carry usage data beyond the configured payload, and map requests SHALL carry no account information. The browser SHALL never contact the map provider directly.

#### Scenario: Network audit
- **WHEN** the app is used for a session with the network inspected, no integration is configured and no map is shown
- **THEN** every request goes to the server's own origin

#### Scenario: Only configured destinations
- **WHEN** the owner has configured a backup destination, has turned maps off, and the server's outbound traffic is inspected
- **THEN** every outbound request goes to that destination and to nothing else

#### Scenario: Maps on by default
- **WHEN** a server with default settings shows a user a task's map and the server's outbound traffic is inspected
- **THEN** the only outbound requests besides configured destinations go to the default map tile provider, carry no cookie, token or user address, and the browser's own requests all go to the server's origin
