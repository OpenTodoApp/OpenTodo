# Spec Delta

## ADDED Requirements

### Requirement: The push relay forwards content-free wake-ups
The project SHALL provide an open-source push relay (`cmd/opentodo-push-relay`) that holds the iPhone app's Apple push key and forwards wake-ups to Apple's push service. The relay SHALL offer exactly three routes: `POST /v1/register`, `POST /v1/wake` and `GET /v1/health`. It SHALL build every payload itself, from the kind of wake-up alone: a `refresh` is a background push carrying only a payload version, and a `due` is an alert push with fixed, app-localized generic text, `mutable-content` and the payload version. A caller SHALL NOT be able to choose any text, sound, URL, topic or identifier in what reaches the phone. The relay SHALL keep no database and no file of devices or servers: what it needs to wake a device SHALL be sealed, by a key only the relay holds, into an opaque handle that the caller presents.

#### Scenario: A wake carries nothing about tasks
- **WHEN** a server sends a `due` wake for a device with a reminder titled "Call the bank"
- **THEN** the push the relay sends to Apple contains the fixed alert keys, `mutable-content`, the category and the version, with the default interruption level, and no title, task id, reminder id, account or server name

#### Scenario: A caller tries to add content
- **WHEN** a wake request carries extra fields such as `title` or `url`
- **THEN** the relay answers 400 `invalid` and sends nothing

#### Scenario: Nothing to look up
- **WHEN** the relay restarts
- **THEN** every handle issued before keeps working until it expires, because nothing about it was stored

### Requirement: Registration seals a device into a handle
`POST /v1/register` SHALL accept exactly an APNs device token, its environment and a 32-byte wake key, and refuse any other field. It SHALL answer a handle sealed with the relay's newest sealing key, with that key's id bound into the authenticated data, holding the token, the environment, the wake key and the issue time. The handle SHALL expire 30 days after it was issued. The relay SHALL store nothing about the registration and SHALL make no request to anyone to answer it. It SHALL keep up to four sealing keys by id and open handles sealed with any of them.

#### Scenario: Register
- **WHEN** the user's server posts a valid token, environment and wake key
- **THEN** the relay answers 200 with a handle and its expiry 30 days ahead, and writes nothing to disk or to its log about the request

#### Scenario: Malformed registration
- **WHEN** a registration carries a token that is not hex, a wake key that is not 32 bytes, or an extra field
- **THEN** the relay answers 400 `invalid` and issues no handle

#### Scenario: Key id changed
- **WHEN** someone changes the key id at the front of a valid handle
- **THEN** the handle no longer opens, and a wake with it gets 401 `signature`

#### Scenario: Sealing key rotated
- **WHEN** a new sealing key is added and an older one is kept
- **THEN** new handles use the new key, and handles sealed with the older key keep working until they expire

### Requirement: Wakes are signed with the device's key
`POST /v1/wake` SHALL accept a handle, a kind (`refresh` or `due`), a Unix time and an HMAC-SHA256 signature over the protocol label, the kind, the time and the handle, made with the wake key sealed in that handle. The relay SHALL send the push only when the handle opens, has not expired, the signature verifies and the time is within 300 seconds of the relay's clock. A forged handle, a handle sealed with an unknown key, a wrong signature and a stale time SHALL all get the same answer, 401 `signature`. An expired handle SHALL get 410 `expired`, and a token that Apple reports as unregistered or invalid SHALL get 410 `gone`.

#### Scenario: A valid wake
- **WHEN** a server sends a correctly signed `refresh` for a live handle
- **THEN** the relay answers 202 and Apple receives one background push for that device

#### Scenario: Without the wake key
- **WHEN** someone who holds a handle but not its wake key sends a wake
- **THEN** the relay answers 401 `signature` and sends nothing

#### Scenario: Forged handle
- **WHEN** a wake carries a handle the relay did not seal
- **THEN** the answer is the same 401 `signature` as for a wrong signature

#### Scenario: Expired
- **WHEN** a wake names a handle issued more than 30 days ago
- **THEN** the relay answers 410 `expired` and sends nothing

#### Scenario: The app was deleted
- **WHEN** Apple answers that the device token is unregistered
- **THEN** the relay answers 410 `gone`, so the server can forget the device

### Requirement: Rate limits protect devices and the key
The relay SHALL limit, in memory only: per device token, 3 `refresh` an hour, and 4 `due` an hour and 24 a day, whichever handle names it; per source address (IPv6 grouped per /56), 3,000 wakes an hour and 30 registrations an hour; per instance, 50 wakes a second. A request over a limit SHALL get 429 with `Retry-After` and SHALL send nothing. Per-device counters SHALL be keyed by a salted hash whose salt changes daily. Request bodies SHALL be at most 4 KB. The limits SHALL reset when the relay restarts, and the documentation SHALL say so; the reference deployment SHALL be one long-running instance.

#### Scenario: Too many wakes for one device
- **WHEN** a server sends a fourth `refresh` for the same handle within an hour
- **THEN** the relay answers 429 with `Retry-After` and Apple receives nothing for it

#### Scenario: Alerts to a known token
- **WHEN** someone who knows a phone's APNs token registers it again and sends `due` wakes
- **THEN** the phone receives at most 4 generic alerts in that hour and 24 that day, counted together with its own server's

#### Scenario: One address registers in bulk
- **WHEN** one address sends its 31st registration within an hour
- **THEN** the relay answers 429 and validates nothing with Apple

### Requirement: The relay keeps no record
The relay SHALL write no per-request log line: no address, handle, token, kind or time. Errors SHALL be logged by class only. Once an hour it SHALL write aggregate counters to standard output: registrations, wakes by kind and outcome, refusals by limit and Apple errors by reason. It SHALL offer no metrics or debug route. Its counters and rate-limit state SHALL live in memory and be lost on restart. The reference deployment SHALL turn off the access logs of the proxy in front of it.

#### Scenario: After a day of traffic
- **WHEN** the relay has served a day of registrations and wakes
- **THEN** its output holds only hourly counter lines and error classes, and no address, handle or token appears in it

#### Scenario: Health
- **WHEN** anyone calls `GET /v1/health`
- **THEN** the relay answers 200 with the protocol version and nothing else

### Requirement: The relay is built and released with the app
The relay SHALL live in the OpenTodo repository, use no dependency beyond the Go standard library and the module's existing `golang.org/x/crypto`, and be released from the same version tags as the app as its own container image. The image SHALL be distroless, run as nonroot, be pinned by digest in its deployment, and be signed with an SBOM, like the server's. The protocol version SHALL be part of the route, and a new version SHALL be added beside the old one, which stays for at least a year.

#### Scenario: A release
- **WHEN** a final version tag is pushed
- **THEN** a signed relay image with an SBOM is published for that tag next to the server's image

#### Scenario: An older server
- **WHEN** a server that speaks protocol 1 calls a relay that also speaks protocol 2
- **THEN** its `/v1/` requests are answered as before
